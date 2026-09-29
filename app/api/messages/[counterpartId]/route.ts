import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { requireAuth, handleAuthError } from "@/lib/session-guard";

// GET /api/messages/[counterpartId] -> l'historique complet de la conversation
// entre l'utilisateur connecté et "counterpartId". Effet de bord volontaire :
// ouvrir la conversation marque comme lus les messages reçus de cette
// personne (comme un accusé de lecture classique de messagerie).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ counterpartId: string }> }
) {
  try {
    const ctx = await requireAuth(); // étape 1
    const { counterpartId } = await params;

    // étape 3 : l'autre personne doit appartenir à la même organisation.
    const counterpart = await prisma.user.findFirst({
      where: { id: counterpartId, organizationId: ctx.organizationId, ...VISIBLE_USER },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (!counterpart) {
      return Response.json({ error: "Conversation introuvable" }, { status: 404 });
    }

    const messages = await prisma.message.findMany({
      where: {
        organizationId: ctx.organizationId,
        OR: [
          { senderId: ctx.userId, receiverId: counterpartId },
          { senderId: counterpartId, receiverId: ctx.userId },
        ],
      },
      orderBy: { createdAt: "asc" },
    });

    await prisma.message.updateMany({
      where: {
        organizationId: ctx.organizationId,
        senderId: counterpartId,
        receiverId: ctx.userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return Response.json({
      counterpart,
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        fromMe: m.senderId === ctx.userId,
      })),
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
