import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notifications";
import { VISIBLE_USER } from "@/lib/visibility";
import { billingConfigured, stripeRequest, type StripeSubscription } from "@/lib/stripe";

// ------------------------------------------------------------
// Facturation (AUDIT.md 7.45) : abonnement Stripe « par employé actif / mois ».
//
// - L'admin active l'abonnement depuis Paramètres (Stripe Checkout). Pendant
//   l'essai gratuit, la carte est enregistrée mais le 1er paiement n'a lieu
//   qu'à la fin de l'essai.
// - Les webhooks Stripe (/api/stripe/webhook) tiennent l'entreprise à jour.
// - Chaque jour : nombre d'employés actifs envoyé à Stripe (prochaine
//   facture) ; période de grâce de 7 jours quand l'essai finit sans
//   abonnement ou qu'un paiement échoue ; suspension automatique ensuite
//   (suspendedReason "billing"), levée dès que le paiement passe.
// - Jamais concernés : la démo, et les entreprises sans essai ni abonnement
//   Stripe (les tiennes, ou « Client confirmé » réglé autrement).
// ------------------------------------------------------------

export const GRACE_DAYS = 7;
export const PAID_STATUSES = ["active", "trialing"];
const DAY_MS = 86_400_000;

export const isPaid = (status: string | null | undefined) => Boolean(status && PAID_STATUSES.includes(status));

/**
 * Entreprise INTERNE du propriétaire (celle qui contient le compte
 * SUPER_ADMIN, ex. « Mindmate Compagny ») : jamais facturée, aucune carte
 * « Abonnement » (AUDIT.md 7.45).
 */
export async function isInternalOrganization(organizationId: string) {
  const owners = await prisma.user.count({ where: { organizationId, role: "SUPER_ADMIN" } });
  return owners > 0;
}

/** Employés facturés : comptes actifs de l'entreprise (au moins 1). */
export async function countBillableEmployees(organizationId: string) {
  const count = await prisma.user.count({ where: { organizationId, status: "ACTIVE", ...VISIBLE_USER } });
  return Math.max(1, count);
}

/** Réactive une entreprise suspendue AUTOMATIQUEMENT pour non-paiement. */
async function reactivateIfBillingSuspended(organizationId: string) {
  const res = await prisma.organization.updateMany({
    where: { id: organizationId, status: "SUSPENDED", suspendedReason: "billing" },
    data: { status: "ACTIVE", suspendedAt: null, suspendedReason: null },
  });
  if (res.count === 1) {
    await prisma.auditLog.create({
      data: { organizationId, action: "ORGANIZATION_REACTIVATED", metadata: { reason: "billing" } },
    });
  }
}

async function findOrgForStripe(customerId: string | null | undefined, subscriptionId?: string | null, organizationIdHint?: string | null) {
  const or: Prisma.OrganizationWhereInput[] = [];
  if (subscriptionId) or.push({ stripeSubscriptionId: subscriptionId });
  if (customerId) or.push({ stripeCustomerId: customerId });
  if (organizationIdHint) or.push({ id: organizationIdHint });
  if (or.length === 0) return null;
  return prisma.organization.findFirst({ where: { OR: or, isDemo: false }, select: { id: true, billingGraceUntil: true } });
}

/** Applique l'état d'un abonnement Stripe à l'entreprise (webhooks). */
export async function applySubscription(sub: StripeSubscription, organizationIdHint?: string | null) {
  const org = await findOrgForStripe(sub.customer, sub.id, organizationIdHint ?? sub.metadata?.organizationId);
  if (!org) {
    console.warn("[billing] abonnement sans entreprise", sub.id);
    return;
  }
  const item = sub.items?.data?.[0];
  const periodEnd = sub.current_period_end ?? item?.current_period_end;
  const paid = isPaid(sub.status);
  const failing = ["past_due", "unpaid", "canceled", "incomplete_expired"].includes(sub.status);
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      stripeCustomerId: sub.customer,
      stripeSubscriptionId: sub.id,
      stripeSubscriptionItemId: item?.id ?? null,
      billingStatus: sub.status,
      billingQuantity: item?.quantity ?? null,
      billingPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      ...(paid ? { plan: "pro", billingGraceUntil: null } : {}),
      ...(failing && !org.billingGraceUntil ? { billingGraceUntil: new Date(Date.now() + GRACE_DAYS * DAY_MS) } : {}),
    },
  });
  if (paid) await reactivateIfBillingSuspended(org.id);
}

/** Paiement refusé : la période de grâce commence (si ce n'est pas déjà fait). */
export async function markPaymentFailed(customerId: string) {
  const org = await findOrgForStripe(customerId);
  if (!org || org.billingGraceUntil) return;
  await prisma.organization.update({
    where: { id: org.id },
    data: { billingGraceUntil: new Date(Date.now() + GRACE_DAYS * DAY_MS) },
  });
}

/** Facture payée : fin de la période de grâce, réactivation si besoin. */
export async function markInvoicePaid(customerId: string, invoice?: PaidInvoice) {
  const org = await findOrgForStripe(customerId);
  if (!org) return;
  await prisma.organization.update({ where: { id: org.id }, data: { billingGraceUntil: null } });
  await reactivateIfBillingSuspended(org.id);
  if (invoice && invoice.amount_paid > 0) await sendInvoiceToOwner(org.id, invoice);
}

// Champs utiles d'une facture Stripe (événement invoice.paid).
export type PaidInvoice = {
  id: string;
  number?: string | null;
  amount_paid: number; // en cents
  currency: string;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
};

/** Adresse qui reçoit une copie de chaque facture payée (AUDIT.md 7.47). */
export const BILLING_NOTIFY_EMAIL = () => process.env.BILLING_NOTIFY_EMAIL?.trim() || "mindmatecompagny@gmail.com";

/**
 * Paiement réel reçu (montant > 0) : courriel au propriétaire avec le
 * montant et les liens vers la facture Stripe (page + PDF), et notification
 * dans son espace. Le PREMIER paiement d'une entreprise est signalé comme tel
 * (repéré par une ligne BILLING_FIRST_PAYMENT dans son historique).
 * Chaque facture n'est envoyée qu'une fois, même si Stripe renvoie l'événement.
 */
async function sendInvoiceToOwner(organizationId: string, invoice: PaidInvoice) {
  try {
    const already = await prisma.auditLog.findFirst({
      where: { organizationId, action: { in: ["BILLING_FIRST_PAYMENT", "BILLING_PAYMENT"] }, targetId: invoice.id },
      select: { id: true },
    });
    if (already) return;
    const first = !(await prisma.auditLog.findFirst({ where: { organizationId, action: "BILLING_FIRST_PAYMENT" }, select: { id: true } }));
    await prisma.auditLog.create({
      data: {
        organizationId,
        action: first ? "BILLING_FIRST_PAYMENT" : "BILLING_PAYMENT",
        targetId: invoice.id,
        metadata: { amount: invoice.amount_paid, currency: invoice.currency, number: invoice.number ?? null },
      },
    });

    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, slug: true, billingQuantity: true } });
    const amount = new Intl.NumberFormat("fr-CA", { style: "currency", currency: invoice.currency.toUpperCase() }).format(invoice.amount_paid / 100);
    const name = org?.name ?? "Entreprise";
    const title = first ? `Premier paiement reçu : ${name} (${amount})` : `Paiement reçu : ${name} (${amount})`;
    const lines = [
      first ? `${name} vient d'effectuer son premier paiement !` : `${name} a payé sa facture.`,
      `Montant : ${amount}`,
      invoice.number ? `Facture : ${invoice.number}` : null,
      org?.billingQuantity ? `Employés facturés : ${org.billingQuantity}` : null,
      org?.slug ? `Identifiant : ${org.slug}` : null,
    ].filter((l): l is string => Boolean(l));
    const links = [
      invoice.hosted_invoice_url ? { label: "Voir la facture", url: invoice.hosted_invoice_url } : null,
      invoice.invoice_pdf ? { label: "Télécharger le PDF", url: invoice.invoice_pdf } : null,
    ].filter((l): l is { label: string; url: string } => Boolean(l));

    await sendEmail({
      to: BILLING_NOTIFY_EMAIL(),
      subject: title,
      text: [...lines, "", ...links.map((l) => `${l.label} : ${l.url}`)].join("\n"),
      html: `<p>${lines.map((l) => escapeHtml(l)).join("<br>")}</p>${links
        .map((l) => `<p><a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a></p>`)
        .join("")}`,
    });

    const owners = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true, organizationId: true } });
    await Promise.all(
      owners.map((o) =>
        notifyUser(o.organizationId, o.id, {
          type: "BILLING_PAYMENT_RECEIVED",
          title,
          body: lines.slice(1).join(" · "),
          link: invoice.hosted_invoice_url ?? "/platform/organizations",
        }).catch((e) => console.error("[billing] notification de paiement", e))
      )
    );
  } catch (error) {
    console.error("[billing] facture non transmise au propriétaire", error);
  }
}

async function emailOrgAdmins(organizationId: string, subject: string, text: string) {
  const admins = await prisma.user.findMany({
    where: { organizationId, role: "ORG_ADMIN", status: "ACTIVE", email: { not: null } },
    select: { email: true },
  });
  await Promise.all(
    admins.map((a) =>
      sendEmail({ to: a.email!, subject, text, html: `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` })
    )
  );
}

async function notifyOwners(title: string, body: string) {
  const owners = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true, organizationId: true } });
  await Promise.all(
    owners.map((o) =>
      notifyUser(o.organizationId, o.id, { type: "BILLING_SUSPENDED", title, body, link: "/platform/organizations" }).catch((e) =>
        console.error("[billing] notification non envoyée", e)
      )
    )
  );
}

/**
 * Tâche quotidienne (cron + visite de l'espace propriétaire) :
 * 1. essai fini sans abonnement -> période de grâce de 7 jours ;
 * 2. période de grâce dépassée -> suspension automatique ;
 * 3. nombre d'employés actifs envoyé à Stripe.
 * Ne fait rien tant que Stripe n'est pas configuré.
 */
export async function runDailyBilling(now = new Date()) {
  if (!billingConfigured()) return { graced: 0, suspended: 0, synced: 0 };
  const notPaid: Prisma.OrganizationWhereInput = { OR: [{ billingStatus: null }, { billingStatus: { notIn: PAID_STATUSES } }] };

  // 1. Essais terminés sans abonnement payé : 7 jours de grâce (au moins
  //    2 jours à partir d'aujourd'hui, pour ne jamais surprendre personne).
  const ended = await prisma.organization.findMany({
    where: { AND: [notPaid, { isDemo: false, status: "ACTIVE", trialEndsAt: { lte: now }, billingGraceUntil: null }] },
    select: { id: true, trialEndsAt: true },
    take: 200,
  });
  for (const org of ended) {
    const grace = Math.max(org.trialEndsAt!.getTime() + GRACE_DAYS * DAY_MS, now.getTime() + 2 * DAY_MS);
    await prisma.organization.update({ where: { id: org.id }, data: { billingGraceUntil: new Date(grace) } });
  }

  // 2. Grâce dépassée : suspension (seulement les entreprises en essai ou
  //    avec un abonnement Stripe — jamais celles réglées autrement).
  const due = await prisma.organization.findMany({
    where: {
      AND: [
        notPaid,
        { isDemo: false, status: "ACTIVE", billingGraceUntil: { lte: now } },
        { OR: [{ trialEndsAt: { not: null } }, { stripeSubscriptionId: { not: null } }] },
      ],
    },
    select: { id: true, name: true, slug: true },
    take: 200,
  });
  let suspended = 0;
  for (const org of due) {
    const res = await prisma.organization.updateMany({
      where: { id: org.id, status: "ACTIVE" },
      data: { status: "SUSPENDED", suspendedAt: now, suspendedReason: "billing" },
    });
    if (res.count !== 1) continue;
    suspended++;
    await prisma.auditLog.create({ data: { organizationId: org.id, action: "ORGANIZATION_SUSPENDED", metadata: { reason: "billing" } } });
    await emailOrgAdmins(
      org.id,
      "Mindmate Compagny : accès suspendu",
      `L'accès de ${org.name} à Mindmate Compagny est suspendu faute de paiement.\n\nConnectez-vous avec votre compte administrateur sur www.mindmatecompagny.com : vous pourrez activer l'abonnement ou mettre à jour votre carte, et l'accès sera rétabli aussitôt.`
    ).catch((e) => console.error("[billing] courriel de suspension", e));
    await notifyOwners(`Suspendue (paiement) : ${org.name}`, `${org.name} (${org.slug}) a été suspendue automatiquement après 7 jours sans paiement.`);
  }

  // 3. Nombre d'employés actifs -> quantité de l'abonnement (sans prorata :
  //    le nouveau nombre compte à partir de la prochaine facture).
  const subscribed = await prisma.organization.findMany({
    where: { isDemo: false, stripeSubscriptionItemId: { not: null }, billingStatus: { in: [...PAID_STATUSES, "past_due"] } },
    select: { id: true, stripeSubscriptionItemId: true, billingQuantity: true },
    take: 500,
  });
  let synced = 0;
  for (const org of subscribed) {
    const quantity = await countBillableEmployees(org.id);
    if (quantity === org.billingQuantity) continue;
    try {
      await stripeRequest("POST", `/subscription_items/${org.stripeSubscriptionItemId}`, { quantity, proration_behavior: "none" });
      await prisma.organization.update({ where: { id: org.id }, data: { billingQuantity: quantity } });
      synced++;
    } catch (error) {
      console.error("[billing] quantité non synchronisée", org.id, error);
    }
  }

  return { graced: ended.length, suspended, synced };
}

export type BillingBanner =
  | { kind: "trialEnding"; daysLeft: number; date: string; canPay: boolean }
  | { kind: "trialEnded" | "pastDue" | "canceled"; date: string; canPay: boolean };

/** Bandeau pour les admins de l'entreprise (null = rien à afficher). */
export function billingBannerFor(
  org: { isDemo: boolean; trialEndsAt: Date | null; billingStatus: string | null; billingGraceUntil: Date | null },
  now = new Date()
): BillingBanner | null {
  if (org.isDemo || isPaid(org.billingStatus)) return null;
  const canPay = billingConfigured();
  if (org.billingGraceUntil) {
    const kind = org.billingStatus === "canceled" ? "canceled" : org.billingStatus && org.billingStatus !== "incomplete" ? "pastDue" : "trialEnded";
    return { kind, date: org.billingGraceUntil.toISOString(), canPay };
  }
  if (!org.trialEndsAt) return null;
  const daysLeft = Math.ceil((org.trialEndsAt.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft <= 0) return { kind: "trialEnded", date: new Date(org.trialEndsAt.getTime() + GRACE_DAYS * DAY_MS).toISOString(), canPay };
  if (daysLeft <= 7) return { kind: "trialEnding", daysLeft, date: org.trialEndsAt.toISOString(), canPay };
  return null;
}
