import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError, ForbiddenError } from "@/lib/session-guard";
import { isPrimaryAdmin } from "@/lib/admins";
import { notifyUser } from "@/lib/notifications";
import { PLATFORM_CONTACT_NAME, notifyPlatformOwners, replySchema } from "@/lib/support";

// POST /api/support/[id]/messages -> ajouter un message à une demande (7.24).
// - SUPER_ADMIN : répond à n'importe quelle demande (message "fromPlatform").
// - Admin PRINCIPAL : répond uniquement aux demandes de SA propre organisation.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const isOwner = ctx.role === "SUPER_ADMIN";

    if (!isOwner && !(await isPrimaryAdmin(ctx))) {
      throw new ForbiddenError("Réservé à l'administrateur principal");
    }

    const body = await request.json().catch(() => null);
    const parsed = replySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 }
      );
    }

    const ticket = await prisma.supportTicket.findFirst({
      // Un admin ne peut jamais atteindre la demande d'une autre organisation.
      where: isOwner ? { id } : { id, organizationId: ctx.organizationId },
      select: {
        id: true,
        subject: true,
        authorId: true,
        organizationId: true,
        organization: { select: { name: true } },
        author: { select: { firstName: true, lastName: true } },
      },
    });
    if (!ticket) {
      return Response.json({ error: "Demande introuvable" }, { status: 404 });
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.supportMessage.create({
        data: { ticketId: ticket.id, senderId: ctx.userId, fromPlatform: isOwner, content: parsed.data.message },
      }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: isOwner
          ? { lastMessageAt: now, unreadByAuthor: true, unreadByPlatform: false }
          : // Un nouveau message de l'admin rouvre une demande marquée résolue.
            { lastMessageAt: now, unreadByPlatform: true, unreadByAuthor: false, status: "OPEN" },
      }),
    ]);

    if (isOwner) {
      await notifyUser(ticket.organizationId, ticket.authorId, {
        type: "SUPPORT_MESSAGE",
        title: `Réponse de ${PLATFORM_CONTACT_NAME}`,
        body: ticket.subject,
        link: "/dashboard/settings#support",
      });
    } else {
      await notifyPlatformOwners({
        title: `Support — ${ticket.organization.name}`,
        body: `${ticket.author.firstName} ${ticket.author.lastName} a répondu : ${ticket.subject}`,
        link: `/platform/support/${ticket.id}`,
      });
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
