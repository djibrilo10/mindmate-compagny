import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { notifyUser } from "@/lib/notifications";

// ------------------------------------------------------------
// Essai gratuit de 30 jours (AUDIT.md 7.44).
// - Toute nouvelle entreprise (/register) démarre en essai : plan "trial",
//   trialEndsAt = création + 30 jours.
// - Le propriétaire (SUPER_ADMIN) est prévenu automatiquement, par
//   notification ET courriel : 5 jours avant la fin, puis le jour de la fin.
// - À la fin : 7 jours de grâce puis suspension automatique si l'entreprise
//   ne s'est pas abonnée (lib/billing.ts, AUDIT.md 7.45 — seulement quand
//   Stripe est configuré). Le propriétaire peut aussi prolonger ou marquer
//   « Client confirmé » dans /platform/organizations.
// - L'admin de l'entreprise voit un bandeau les 7 derniers jours.
// ------------------------------------------------------------

export const TRIAL_DAYS = 30;
export const REMINDER_DAYS_BEFORE = 5;
export const ADMIN_BANNER_DAYS = 7;
const DAY_MS = 86_400_000;

/** Types des notifications propres à l'espace propriétaire (/platform/notifications). */
export const PLATFORM_NOTIFICATION_TYPES = ["SUPPORT_MESSAGE", "DEMO_REQUEST_RECEIVED", "TRIAL_ENDING", "TRIAL_ENDED", "BILLING_SUSPENDED"];

export function trialEndFrom(start: Date, days = TRIAL_DAYS) {
  return new Date(start.getTime() + days * DAY_MS);
}

export type TrialState = "none" | "active" | "ending" | "ended";

/** État de l'essai et jours restants (arrondis au jour supérieur). */
export function trialInfo(trialEndsAt: Date | null | undefined, now = new Date()) {
  if (!trialEndsAt) return { state: "none" as TrialState, daysLeft: null as number | null };
  const daysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft <= 0) return { state: "ended" as TrialState, daysLeft: 0 };
  if (daysLeft <= REMINDER_DAYS_BEFORE) return { state: "ending" as TrialState, daysLeft };
  return { state: "active" as TrialState, daysLeft };
}

function formatDay(date: Date) {
  return date.toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Toronto" });
}

async function notifyOwners(kind: "ending" | "ended", org: { id: string; name: string; slug: string; trialEndsAt: Date }) {
  const owners = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN", status: "ACTIVE" },
    select: { id: true, organizationId: true, email: true },
  });
  const title = kind === "ending" ? `Fin d'essai bientôt : ${org.name}` : `Essai terminé : ${org.name}`;
  const body =
    kind === "ending"
      ? `L'essai gratuit de ${org.name} se termine le ${formatDay(org.trialEndsAt)}. Contacte l'entreprise pour la suite.`
      : `L'essai gratuit de ${org.name} est terminé depuis le ${formatDay(org.trialEndsAt)}. Choisis : prolonger, « Client confirmé » ou suspendre.`;
  const text = `${body}\n\nIdentifiant : ${org.slug}\nGérer : /platform/organizations`;
  await Promise.all(
    owners.map(async (owner) => {
      await notifyUser(owner.organizationId, owner.id, {
        type: kind === "ending" ? "TRIAL_ENDING" : "TRIAL_ENDED",
        title,
        body,
        link: "/platform/organizations",
      }).catch((e) => console.error("[trial] notification non envoyée", e));
      if (owner.email) {
        await sendEmail({
          to: owner.email,
          subject: title,
          text,
          html: `<p>${escapeHtml(body)}</p><p>Identifiant : <strong>${escapeHtml(org.slug)}</strong></p>`,
        });
      }
    })
  );
}

/**
 * Envoie les rappels dus (idempotent : chaque rappel est « réservé » par une
 * mise à jour conditionnelle avant l'envoi, donc jamais envoyé deux fois).
 * Appelé chaque jour par Vercel Cron (/api/cron/trial-reminders) ET à chaque
 * visite de l'espace propriétaire (app/platform/layout.tsx), pour ne rien
 * manquer même sans CRON_SECRET.
 */
export async function sendDueTrialReminders(now = new Date()) {
  const soon = new Date(now.getTime() + REMINDER_DAYS_BEFORE * DAY_MS);
  const due = await prisma.organization.findMany({
    where: {
      isDemo: false,
      trialEndsAt: { not: null, lte: soon },
      AND: [
        { OR: [{ trialReminderSentAt: null }, { trialEndsAt: { lte: now }, trialEndedNotifiedAt: null }] },
        // Déjà abonnée par carte (AUDIT.md 7.45) : pas de rappel.
        { OR: [{ billingStatus: null }, { billingStatus: { notIn: ["active", "trialing"] } }] },
      ],
    },
    select: { id: true, name: true, slug: true, trialEndsAt: true, trialReminderSentAt: true, trialEndedNotifiedAt: true },
    take: 50,
  });

  let sent = 0;
  for (const org of due) {
    if (!org.trialEndsAt) continue;
    const ended = org.trialEndsAt <= now;
    if (ended && !org.trialEndedNotifiedAt) {
      // L'essai est fini : un seul message « terminé » (le rappel « bientôt »
      // n'a plus de sens s'il n'avait pas encore été envoyé).
      const claimed = await prisma.organization.updateMany({
        where: { id: org.id, trialEndedNotifiedAt: null },
        data: { trialEndedNotifiedAt: now, trialReminderSentAt: org.trialReminderSentAt ?? now },
      });
      if (claimed.count === 1) {
        await notifyOwners("ended", { ...org, trialEndsAt: org.trialEndsAt });
        sent++;
      }
    } else if (!ended && !org.trialReminderSentAt) {
      const claimed = await prisma.organization.updateMany({
        where: { id: org.id, trialReminderSentAt: null },
        data: { trialReminderSentAt: now },
      });
      if (claimed.count === 1) {
        await notifyOwners("ending", { ...org, trialEndsAt: org.trialEndsAt });
        sent++;
      }
    }
  }
  return sent;
}
