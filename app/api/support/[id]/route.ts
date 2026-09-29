import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError, ForbiddenError } from "@/lib/session-guard";
import { isPrimaryAdmin } from "@/lib/admins";

// PATCH /api/support/[id] (voir AUDIT.md 7.24)
// - { markRead: true }                    -> l'admin principal a lu les réponses.
// - { status: "OPEN" | "RESOLVED" }        -> SUPER_ADMIN seulement.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const isOwner = ctx.role === "SUPER_ADMIN";
    const body = await request.json().catch(() => ({}));

    if (isOwner) {
      const status = body?.status;
      if (status !== "OPEN" && status !== "RESOLVED") {
        return Response.json({ error: "Statut invalide" }, { status: 400 });
      }
      const result = await prisma.supportTicket.updateMany({ where: { id }, data: { status } });
      if (result.count === 0) return Response.json({ error: "Demande introuvable" }, { status: 404 });
      return Response.json({ ok: true });
    }

    if (!(await isPrimaryAdmin(ctx))) {
      throw new ForbiddenError("Réservé à l'administrateur principal");
    }
    if (body?.markRead !== true) {
      return Response.json({ error: "Action invalide" }, { status: 400 });
    }
    const result = await prisma.supportTicket.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: { unreadByAuthor: false },
    });
    if (result.count === 0) return Response.json({ error: "Demande introuvable" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
