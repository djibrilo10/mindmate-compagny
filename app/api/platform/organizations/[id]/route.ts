import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import type { Prisma, Role } from "@prisma/client";
import { TRIAL_DAYS, trialEndFrom } from "@/lib/trial";
import { GRACE_DAYS, isInternalOrganization, isPaid } from "@/lib/billing";
import { billingConfigured, stripeRequest } from "@/lib/stripe";

const SUPER_ADMIN_ONLY: Role[] = ["SUPER_ADMIN"];
const VALID_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
type OrganizationStatus = (typeof VALID_STATUSES)[number];

function isValidStatus(value: unknown): value is OrganizationStatus {
  return typeof value === "string" && (VALID_STATUSES as readonly string[]).includes(value);
}

// ------------------------------------------------------------
// Suspendre/réactiver une organisation cliente — voir AUDIT.md 7.20.
// Réservé au SUPER_ADMIN (vous). C'est la barrière qui donne un vrai sens
// à "je dois pouvoir désactiver une organisation si je ne reçois pas de
// paiement" : une fois SUSPENDED, plus personne de cette organisation ne
// peut se connecter (lib/auth.ts) ni utiliser l'app (lib/session-guard.ts).
// ------------------------------------------------------------
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, SUPER_ADMIN_ONLY);

    const { id } = await params;
    const body = await request.json().catch(() => null);

    // Essai gratuit (AUDIT.md 7.44) : { action: "startTrial" | "extendTrial" | "convert", days? }
    if (body && typeof body.action === "string") {
      return handleTrialAction(id, body.action, body.days);
    }

    if (!body || !isValidStatus(body.status)) {
      return Response.json({ error: "Statut invalide. Attendu : ACTIVE ou SUSPENDED." }, { status: 400 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, isDemo: true, billingStatus: true, billingGraceUntil: true, trialEndsAt: true },
    });
    if (!organization) {
      return Response.json({ error: "Organisation introuvable." }, { status: 404 });
    }
    // La démo publique ne se suspend jamais (AUDIT.md 7.43) : les visiteurs
    // de la page d'accueil tomberaient sur « Accès suspendu ».
    if (organization.isDemo && body.status === "SUSPENDED") {
      return Response.json({ error: "L'entreprise de démonstration ne peut pas être suspendue." }, { status: 400 });
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: {
        status: body.status,
        suspendedAt: body.status === "SUSPENDED" ? new Date() : null,
        // Suspension à la main = "manual" (jamais levée par un paiement).
        // Réactivation à la main : 7 nouveaux jours de grâce si l'entreprise
        // n'a toujours pas payé (sinon la tâche quotidienne la resuspendrait).
        suspendedReason: body.status === "SUSPENDED" ? "manual" : null,
        ...(body.status === "ACTIVE" && !isPaid(organization.billingStatus) && (organization.billingGraceUntil || organization.trialEndsAt)
          ? { billingGraceUntil: new Date(Date.now() + GRACE_DAYS * 86_400_000) }
          : {}),
      },
      select: { id: true, status: true },
    });

    // Journalisé dans l'historique de L'ORGANISATION CONCERNÉE (pas celle du
    // SUPER_ADMIN) : c'est là que son propre admin verra qui a suspendu son
    // accès et quand, si jamais il consulte /dashboard/activity après coup.
    await prisma.auditLog.create({
      data: {
        organizationId: id,
        actorId: ctx.userId,
        action: body.status === "SUSPENDED" ? "ORGANIZATION_SUSPENDED" : "ORGANIZATION_REACTIVATED",
      },
    });

    return Response.json({ success: true, status: updated.status });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ------------------------------------------------------------
// Essai gratuit (AUDIT.md 7.44), réservé au SUPER_ADMIN (vérifié plus haut) :
// - startTrial  : (re)démarre un essai de 30 jours à partir d'aujourd'hui ;
// - extendTrial : ajoute `days` jours (1 à 90, défaut 14) à la fin prévue
//                 (ou à aujourd'hui si l'essai est déjà fini) ;
// - convert     : « Client confirmé » -> fin de l'essai, plan "pro".
// Les rappels sont remis à zéro quand la date de fin change.
// ------------------------------------------------------------
async function handleTrialAction(id: string, action: string, rawDays: unknown) {
  const org = await prisma.organization.findUnique({ where: { id }, select: { id: true, isDemo: true, trialEndsAt: true } });
  if (!org) return Response.json({ error: "Organisation introuvable." }, { status: 404 });
  if (org.isDemo) return Response.json({ error: "L'entreprise de démonstration n'a pas d'essai." }, { status: 400 });

  const now = new Date();
  let data: Prisma.OrganizationUpdateInput;
  if (action === "startTrial") {
    data = { plan: "trial", trialEndsAt: trialEndFrom(now, TRIAL_DAYS), trialReminderSentAt: null, trialEndedNotifiedAt: null, billingGraceUntil: null };
  } else if (action === "extendTrial") {
    const days = typeof rawDays === "number" && Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 90 ? rawDays : 14;
    const base = org.trialEndsAt && org.trialEndsAt > now ? org.trialEndsAt : now;
    data = { plan: "trial", trialEndsAt: trialEndFrom(base, days), trialReminderSentAt: null, trialEndedNotifiedAt: null, billingGraceUntil: null };
  } else if (action === "convert") {
    // Réglé autrement que par carte (virement, chèque…) : plus jamais de
    // suspension automatique tant qu'il n'y a pas d'abonnement Stripe.
    data = { plan: "pro", trialEndsAt: null, trialReminderSentAt: null, trialEndedNotifiedAt: null, billingGraceUntil: null };
  } else {
    return Response.json({ error: "Action invalide." }, { status: 400 });
  }

  const updated = await prisma.organization.update({
    where: { id },
    data,
    select: { plan: true, trialEndsAt: true },
  });
  return Response.json({ success: true, plan: updated.plan, trialEndsAt: updated.trialEndsAt?.toISOString() ?? null });
}

// ------------------------------------------------------------
// DELETE /api/platform/organizations/[id] { confirmSlug } (AUDIT.md 7.48)
// Suppression DÉFINITIVE d'une organisation et de tout son contenu
// (employés, horaires, absences, annonces, fichiers, messages, historique…)
// grâce aux onDelete: Cascade du schéma. IRRÉVERSIBLE. Sécurités :
// - SUPER_ADMIN seulement ;
// - l'organisation doit d'abord être SUSPENDUE (deux gestes distincts) ;
// - il faut retaper son identifiant (confirmSlug) ;
// - jamais la démo publique, jamais l'entreprise interne du propriétaire ;
// - abonnement Stripe en cours : annulé d'abord, pour ne plus rien prélever.
// ------------------------------------------------------------
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, SUPER_ADMIN_ONLY);
    const { id } = await params;
    const body = await request.json().catch(() => null);

    const org = await prisma.organization.findUnique({
      where: { id },
      select: { id: true, name: true, slug: true, status: true, isDemo: true, stripeSubscriptionId: true, billingStatus: true },
    });
    if (!org) return Response.json({ error: "Organisation introuvable." }, { status: 404 });
    if (org.isDemo) return Response.json({ error: "L'entreprise de démonstration ne peut pas être supprimée." }, { status: 400 });
    if (await isInternalOrganization(org.id)) {
      return Response.json({ error: "Ton entreprise interne (compte propriétaire) ne peut pas être supprimée." }, { status: 400 });
    }
    if (org.status !== "SUSPENDED") {
      return Response.json({ error: "Suspends d'abord l'organisation, puis supprime-la." }, { status: 400 });
    }
    if (typeof body?.confirmSlug !== "string" || body.confirmSlug.trim().toLowerCase() !== org.slug) {
      return Response.json({ error: "L'identifiant tapé ne correspond pas." }, { status: 400 });
    }

    // Plus aucun prélèvement : on annule l'abonnement Stripe s'il est encore actif.
    if (org.stripeSubscriptionId && org.billingStatus !== "canceled" && billingConfigured()) {
      try {
        await stripeRequest("POST", `/subscriptions/${org.stripeSubscriptionId}/cancel`);
      } catch (error) {
        // Ex. abonnement du mode test inconnu en production : on continue.
        console.warn("[platform:delete] abonnement Stripe non annulé", org.stripeSubscriptionId, error instanceof Error ? error.message : error);
      }
    }

    await prisma.organization.delete({ where: { id: org.id } });
    console.log(`[platform:delete] organisation supprimée définitivement : ${org.name} (${org.slug}) par ${ctx.userId}`);
    return Response.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[platform:delete]", error);
    return Response.json({ error: "Erreur serveur : suppression impossible." }, { status: 500 });
  }
}
