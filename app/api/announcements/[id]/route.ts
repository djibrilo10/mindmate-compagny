import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

// DELETE /api/announcements/[id] -> un admin retire une annonce
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ADMIN_ROLES); // étape 2 : réservé à l'admin

    const { id } = await params;

    // étape 3 : where combine id ET organizationId, impossible de supprimer
    // l'annonce d'une autre organisation même en devinant son id.
    const result = await prisma.announcement.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });

    if (result.count === 0) {
      return Response.json({ error: "Annonce introuvable" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ANNOUNCEMENT_DELETED",
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
