import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { weekSchema } from "@/lib/validations/schedule";
import { addDays, mondayOf, schedulableUsersWhere } from "@/lib/schedule";
import { notifyUsersLocalized } from "@/lib/notifications";

// ------------------------------------------------------------
// POST /api/shifts/publish { week } (AUDIT.md 7.36)
// Publie tous les quarts en brouillon de la semaine (lundi -> dimanche)
// pour les personnes dont on fait l'horaire, puis prévient chaque personne
// concernée (une seule notification par personne).
// ------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const usersWhere = schedulableUsersWhere(ctx);
    if (!usersWhere) return Response.json({ error: "schedule.errors.forbidden" }, { status: 403 });

    const parsed = weekSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "errors.invalidData" }, { status: 400 });
    }
    const week = mondayOf(parsed.data.week);

    const where = {
      organizationId: ctx.organizationId,
      publishedAt: null,
      date: { gte: week, lte: addDays(week, 6) },
      user: usersWhere,
    };
    const drafts = await prisma.shift.findMany({ where, select: { id: true, userId: true } });
    if (drafts.length === 0) return Response.json({ published: 0 });

    await prisma.shift.updateMany({
      where: { id: { in: drafts.map((d) => d.id) } },
      data: { publishedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "SCHEDULE_PUBLISHED",
        metadata: { week, count: drafts.length },
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

    return Response.json({ published: drafts.length, people: userIds.length });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[shifts:publish]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
