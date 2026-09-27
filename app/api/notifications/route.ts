import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";

const MAX_NOTIFICATIONS = 50;

// GET /api/notifications -> les notifications de l'utilisateur connecté
// UNIQUEMENT les siennes (userId vient du token, jamais du client) — même
// dans la même organisation, personne ne voit les notifications d'un autre.
export async function GET() {
  try {
    const ctx = await requireAuth();

    const notifications = await prisma.notification.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: MAX_NOTIFICATIONS,
    });

    return Response.json({ notifications });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/notifications -> marque TOUTES les notifications non lues de
// l'utilisateur connecté comme lues ("Tout marquer comme lu").
export async function POST() {
  try {
    const ctx = await requireAuth();

    await prisma.notification.updateMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, isRead: false },
      data: { isRead: true },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
