import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { publishSchema } from "@/lib/validations/schedule";
import { addDays, mondayOf, schedulableUsersWhere } from "@/lib/schedule";
import { notifyUsersLocalized } from "@/lib/notifications";

// ------------------------------------------------------------
// POST /api/shifts/publish { week, departmentId, teamVisible }
// (AUDIT.md 7.36 et 7.37)
// - departmentId : "" = tous les départements dont on fait l'horaire,
//   "__none__" = personnes sans département, sinon un département précis ;
// - teamVisible : true = tous les employés de l'entreprise voient ces
//   quarts (« Horaire de l'équipe »), false = chacun voit seulement les siens.
// Publie les brouillons de la semaine dans ce périmètre (une notification
// par personne concernée) et applique le même choix de visibilité aux
// quarts déjà publiés de ce périmètre (sans nouvelle notification).
// ------------------------------------------------------------

const NO_DEPARTMENT = "__none__";

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const usersWhere = schedulableUsersWhere(ctx);
    if (!usersWhere) return Response.json({ error: "schedule.errors.forbidden" }, { status: 403 });

    const parsed = publishSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "errors.invalidData" }, { status: 400 });
    }
    const week = mondayOf(parsed.data.week);
    const { departmentId, teamVisible } = parsed.data;

    // Le département ciblé s'ajoute au périmètre du gérant (un responsable
    // ne peut donc jamais publier pour un département qu'il ne gère pas).
    const scopedUsers: Prisma.UserWhereInput =
      departmentId === ""
        ? usersWhere
        : { AND: [usersWhere, departmentId === NO_DEPARTMENT ? { departmentId: null } : { departmentId }] };

    const inScope: Prisma.ShiftWhereInput = {
      organizationId: ctx.organizationId,
      date: { gte: week, lte: addDays(week, 6) },
      user: scopedUsers,
    };

    const drafts = await prisma.shift.findMany({ where: { ...inScope, publishedAt: null }, select: { id: true, userId: true } });
    const now = new Date();

    const [, updatedPublished] = await prisma.$transaction([
      prisma.shift.updateMany({
        where: { id: { in: drafts.map((d) => d.id) } },
        data: { publishedAt: now, teamVisible },
      }),
      prisma.shift.updateMany({
        where: { ...inScope, publishedAt: { not: null }, teamVisible: !teamVisible },
        data: { teamVisible },
      }),
    ]);

    if (drafts.length === 0 && updatedPublished.count === 0) {
      return Response.json({ published: 0, visibilityUpdated: 0 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "SCHEDULE_PUBLISHED",
        metadata: { week, count: drafts.length, departmentId: departmentId || null, teamVisible },
      },
    });

    const userIds = Array.from(new Set(drafts.map((d) => d.userId)));
    await notifyUsersLocalized(ctx.organizationId, userIds, (t, { formatDate }) => ({
      type: "SCHEDULE_PUBLISHED",
      title: t("schedule.notif.publishedTitle"),
      body: t("schedule.notif.publishedBody", {
        date: formatDate(`${week}T12:00:00Z`, { month: "long", day: "numeric" }),
      }),
      link: `/dashboard/schedule?week=${week}`,
    }));

    return Response.json({ published: drafts.length, people: userIds.length, visibilityUpdated: updatedPublished.count });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[shifts:publish]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
