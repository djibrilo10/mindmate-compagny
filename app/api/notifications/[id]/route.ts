import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";

// PATCH /api/notifications/[id] -> marque une notification comme lue (ou
// non lue si isRead: false est explicitement envoyé).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const isRead = body.isRead !== false; // par défaut : marquer comme lue

    // where combine id ET userId ET organizationId : impossible de marquer
    // comme lue la notification de quelqu'un d'autre, même en devinant l'id.
    const result = await prisma.notification.updateMany({
      where: { id, userId: ctx.userId, organizationId: ctx.organizationId },
      data: { isRead },
    });

    if (result.count === 0) {
      return Response.json({ error: "Notification introuvable" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
