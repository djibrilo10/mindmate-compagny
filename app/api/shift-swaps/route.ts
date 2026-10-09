import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { swapCreateSchema } from "@/lib/validations/schedule";
import { formatMinutes, todayInZone } from "@/lib/schedule";
import { notifyUsersLocalized } from "@/lib/notifications";
import { ACTIVE_SWAP_STATUSES, colleaguesWhere, departmentColleagueIds } from "@/lib/shift-swaps";

// ------------------------------------------------------------
// POST /api/shift-swaps { shiftId, targetUserId, note } (AUDIT.md 7.42)
// L'employé propose de céder un de SES quarts publiés, à venir :
// - targetUserId = un collègue précis -> lui seul est prévenu ;
// - targetUserId = ""                 -> tout son département est prévenu,
//                                        le premier qui accepte le prend.
// Rien ne change à l'horaire avant l'approbation du responsable.
// ------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json().catch(() => null);
    const parsed = swapCreateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "errors.invalidData" }, { status: 400 });
    }
    const { shiftId, targetUserId, note } = parsed.data;

    const shift = await prisma.shift.findFirst({
      where: { id: shiftId, organizationId: ctx.organizationId, userId: ctx.userId },
      select: { id: true, date: true, startMinute: true, endMinute: true, publishedAt: true },
    });
    if (!shift) return Response.json({ error: "schedule.swap.errors.notFound" }, { status: 404 });
    if (!shift.publishedAt) return Response.json({ error: "schedule.swap.errors.notPublished" }, { status: 400 });
    if (shift.date < todayInZone()) return Response.json({ error: "schedule.swap.errors.past" }, { status: 400 });

    const active = await prisma.shiftSwap.findFirst({
      where: { shiftId: shift.id, status: { in: ACTIVE_SWAP_STATUSES } },
      select: { id: true },
    });
    if (active) return Response.json({ error: "schedule.swap.errors.alreadyActive" }, { status: 409 });

    if (targetUserId) {
      const target = await prisma.user.findFirst({
        where: { ...colleaguesWhere(ctx.organizationId, ctx.userId), id: targetUserId },
        select: { id: true },
      });
      if (!target) return Response.json({ error: "schedule.swap.errors.targetInvalid" }, { status: 400 });
    }

    const me = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { firstName: true, lastName: true, departmentId: true },
    });
    if (!me) return Response.json({ error: "schedule.swap.errors.notFound" }, { status: 404 });

    const swap = await prisma.shiftSwap.create({
      data: {
        organizationId: ctx.organizationId,
        shiftId: shift.id,
        fromUserId: ctx.userId,
        targetUserId: targetUserId || null,
        note: note || null,
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "SCHEDULE_SWAP_OFFERED",
        targetId: swap.id,
        metadata: { date: shift.date, open: !targetUserId },
      },
    });

    const recipients = targetUserId
      ? [targetUserId]
      : await departmentColleagueIds(ctx.organizationId, ctx.userId, me.departmentId);
    const name = `${me.firstName} ${me.lastName}`;
    const time = `${formatMinutes(shift.startMinute)} – ${formatMinutes(shift.endMinute)}`;
    await notifyUsersLocalized(ctx.organizationId, recipients, (t, { formatDate }) => ({
      type: "SCHEDULE_SWAP_OFFERED",
      title: t("schedule.swap.notif.offeredTitle"),
      body: t(targetUserId ? "schedule.swap.notif.offeredToYouBody" : "schedule.swap.notif.offeredToTeamBody", {
        name,
        date: formatDate(`${shift.date}T12:00:00Z`, { weekday: "long", month: "long", day: "numeric" }),
        time,
      }),
      link: "/dashboard/schedule",
    }));

    return Response.json({ id: swap.id }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[shift-swaps:create]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
