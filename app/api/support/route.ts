import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { requirePrimaryAdmin } from "@/lib/admins";
import { MAX_NEW_TICKETS_PER_DAY, PLATFORM_CONTACT_NAME, newTicketSchema, notifyPlatformOwners } from "@/lib/support";

// POST /api/support -> l'ADMIN PRINCIPAL ouvre une demande auprès du
// propriétaire de la plateforme ("Contacter Djibril", voir AUDIT.md 7.24).
// Les co-admins, gérants et employés n'y ont pas accès.
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    await requirePrimaryAdmin(ctx);

    const body = await request.json().catch(() => null);
    const parsed = newTicketSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 }
      );
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.supportTicket.count({
      where: { organizationId: ctx.organizationId, createdAt: { gte: since } },
    });
    if (recent >= MAX_NEW_TICKETS_PER_DAY) {
      return Response.json(
        {
          error: `Limite atteinte (${MAX_NEW_TICKETS_PER_DAY} nouvelles demandes par jour). Réponds dans une demande existante.`,
        },
        { status: 429 }
      );
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        organizationId: ctx.organizationId,
        authorId: ctx.userId,
        subject: parsed.data.subject,
        unreadByPlatform: true,
        messages: {
          create: { senderId: ctx.userId, fromPlatform: false, content: parsed.data.message },
        },
      },
      select: {
        id: true,
        subject: true,
        organization: { select: { name: true } },
        author: { select: { firstName: true, lastName: true } },
      },
    });

    await notifyPlatformOwners({
      title: `Support — ${ticket.organization.name}`,
      body: `${ticket.author.firstName} ${ticket.author.lastName} : ${ticket.subject}`,
      link: `/platform/support/${ticket.id}`,
    });

    return Response.json(
      { ok: true, ticketId: ticket.id, message: `Message envoyé à ${PLATFORM_CONTACT_NAME}.` },
      { status: 201 }
    );
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
