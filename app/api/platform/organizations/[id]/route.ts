import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import type { Role } from "@prisma/client";

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

    if (!body || !isValidStatus(body.status)) {
      return Response.json({ error: "Statut invalide. Attendu : ACTIVE ou SUSPENDED." }, { status: 400 });
    }

    const organization = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!organization) {
      return Response.json({ error: "Organisation introuvable." }, { status: 404 });
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: {
        status: body.status,
        suspendedAt: body.status === "SUSPENDED" ? new Date() : null,
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
