import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError, ForbiddenError } from "@/lib/session-guard";

const VALID_STATUSES = ["ACTIVE", "DISABLED"] as const;

// PATCH /api/users/[id] -> un admin active/désactive un compte employé.
// On ne supprime JAMAIS réellement un utilisateur : voir le commentaire sur
// UserStatus dans schema.prisma ("on désactive, on ne supprime jamais
// vraiment, traçabilité"). Ça évite aussi de casser toutes les relations
// (signalements, absences, etc.) qui pointent vers cet utilisateur.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ["ORG_ADMIN", "SUPER_ADMIN"]); // étape 2 : réservé à l'admin, pas au gérant

    const { id } = await params;

    if (id === ctx.userId) {
      throw new ForbiddenError("Impossible de modifier son propre statut");
    }

    const body = await request.json();
    const { status } = body;

    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "Statut invalide" }, { status: 400 });
    }

    // étape 3 : where combine id ET organizationId, impossible de toucher un
    // utilisateur d'une autre organisation même en devinant son id.
    const result = await prisma.user.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: { status },
    });

    if (result.count === 0) {
      return Response.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: status === "DISABLED" ? "USER_DISABLED" : "USER_REACTIVATED",
        targetId: id,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
