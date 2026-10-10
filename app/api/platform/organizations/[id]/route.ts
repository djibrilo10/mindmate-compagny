import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import type { Prisma, Role } from "@prisma/client";
import { TRIAL_DAYS, trialEndFrom } from "@/lib/trial";
import { GRACE_DAYS, isPaid } from "@/lib/billing";

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
