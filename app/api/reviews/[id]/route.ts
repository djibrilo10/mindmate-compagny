import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

// DELETE /api/reviews/[id] -> un admin retire un avis (ex : contenu
// inapproprié). L'auteur original n'est jamais révélé dans le journal
// d'activité pour cette action, avis anonyme ou non.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ADMIN_ROLES); // étape 2 : réservé à l'admin
    const { id } = await params;

    const result = await prisma.review.deleteMany({
      where: { id, organizationId: ctx.organizationId }, // étape 3
    });
    if (result.count === 0) {
      return Response.json({ error: "Avis introuvable" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "REVIEW_DELETED",
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
