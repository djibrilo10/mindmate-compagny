import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { managedByWhere } from "@/lib/departments";
import { requireAuth, handleAuthError, ForbiddenError } from "@/lib/session-guard";
import { notifyUser } from "@/lib/notifications";

// L'admin peut écrire à n'importe quel employé ; le responsable, aux membres de ses départements (7.34)
// pour démarrer une conversation. Un employé, lui, ne peut que RÉPONDRE à
// une conversation déjà commencée par un membre de l'administration (voir
// le commentaire "communication ciblée admin <-> employé" sur le modèle
// Message dans schema.prisma).

// POST /api/messages -> envoie un message privé à un utilisateur précis
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth(); // étape 1

    const body = await request.json();
    const { receiverId, content } = body;

    if (!receiverId || !content?.trim()) {
      return Response.json({ error: "Destinataire et message requis" }, { status: 400 });
    }
    if (receiverId === ctx.userId) {
      return Response.json(
        { error: "Impossible de s'envoyer un message à soi-même" },
        { status: 400 }
      );
    }

    // étape 3 : le destinataire doit appartenir à la même organisation.
    const receiver = await prisma.user.findFirst({
      where: { id: receiverId, organizationId: ctx.organizationId, ...VISIBLE_USER },
      select: { id: true },
    });
    if (!receiver) {
      return Response.json({ error: "Destinataire introuvable" }, { status: 404 });
    }

    // Responsable (AUDIT.md 7.34) : peut COMMENCER une conversation seulement
    // avec un membre des départements qu'il gère ; sinon, comme un employé,
    // il ne peut que répondre.
    const canStartWithReceiver =
      ctx.role === "ORG_ADMIN" ||
      ctx.role === "SUPER_ADMIN" ||
      (ctx.role === "MANAGER" &&
        (await prisma.user.count({ where: { id: receiverId, ...managedByWhere(ctx.userId) } })) > 0);
    if (!canStartWithReceiver) {
      // étape 2 (pour un rôle non-admin) : la conversation doit avoir été
      // commencée par ce destinataire, sinon un employé pourrait écrire à
      // n'importe qui dans l'organisation.
      const alreadyStarted = await prisma.message.findFirst({
        where: { organizationId: ctx.organizationId, senderId: receiverId, receiverId: ctx.userId },
        select: { id: true },
      });
      if (!alreadyStarted) {
        throw new ForbiddenError(
          "Tu ne peux répondre qu'à une conversation déjà commencée par un membre de l'administration"
        );
      }
    }

    const message = await prisma.message.create({
      data: {
        organizationId: ctx.organizationId, // vient du token, jamais du client
        senderId: ctx.userId,
        receiverId,
        content: content.trim(),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "MESSAGE_SENT",
        targetId: message.id,
        metadata: { receiverId },
      },
    });

    await notifyUser(ctx.organizationId, receiverId, {
      type: "MESSAGE_SENT",
      title: "Nouveau message",
      body: content.trim().slice(0, 140),
      link: "/dashboard/messages",
    });

    return Response.json(
      {
        message: {
          id: message.id,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          fromMe: true,
          isRead: message.isRead,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
