import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { swapActionSchema } from "@/lib/validations/schedule";
import { canScheduleUser, findOverlappingShift, formatMinutes, mondayOf, todayInZone } from "@/lib/schedule";
import { notifyUsersLocalized } from "@/lib/notifications";
import { swapApproverIds } from "@/lib/shift-swaps";
import type { MessageKey } from "@/lib/i18n/translator";

// ------------------------------------------------------------
// PATCH /api/shift-swaps/[id] { action } (AUDIT.md 7.42)
//   accept  : un collègue prend le quart (offre OPEN qui lui est destinée)
//             -> ACCEPTED, les responsables sont prévenus ;
//   decline : le collègue VISÉ refuse -> DECLINED ;
//   cancel  : celui qui cède retire sa demande (OPEN ou ACCEPTED) ;
//   approve : responsable/admin qui gère les deux personnes -> le quart
//             passe au nom du collègue ;
//   reject  : responsable/admin refuse -> rien ne change.
// Chaque transition est conditionnelle (updateMany sur le statut attendu) :
// deux collègues qui acceptent en même temps -> un seul l'obtient.
// ------------------------------------------------------------

type Swap = NonNullable<Awaited<ReturnType<typeof loadSwap>>>;

function loadSwap(id: string, organizationId: string) {
  return prisma.shiftSwap.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      status: true,
      fromUserId: true,
      targetUserId: true,
      takenById: true,
      fromUser: { select: { firstName: true, lastName: true, departmentId: true } },
      takenBy: { select: { firstName: true, lastName: true, departmentId: true } },
      shift: { select: { id: true, userId: true, date: true, startMinute: true, endMinute: true } },
    },
  });
}

const error = (key: string, status: number) => Response.json({ error: key }, { status });

async function transition(id: string, from: "OPEN" | "ACCEPTED" | ("OPEN" | "ACCEPTED")[], data: Record<string, unknown>) {
  const res = await prisma.shiftSwap.updateMany({
    where: { id, status: Array.isArray(from) ? { in: from } : from },
    data,
  });
  return res.count === 1;
}

async function audit(ctx: { organizationId: string; userId: string }, action: string, swap: Swap) {
  await prisma.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.userId,
      action,
      targetId: swap.id,
      metadata: { date: swap.shift.date },
    },
  });
}

async function notify(organizationId: string, userIds: (string | null | undefined)[], swap: Swap, type: string, titleKey: MessageKey, bodyKey: MessageKey, vars: Record<string, string> = {}) {
  const ids = userIds.filter((v): v is string => Boolean(v));
  await notifyUsersLocalized(organizationId, ids, (t, { formatDate }) => ({
    type,
    title: t(titleKey),
    body: t(bodyKey, {
      ...vars,
      date: formatDate(`${swap.shift.date}T12:00:00Z`, { weekday: "long", month: "long", day: "numeric" }),
      time: `${formatMinutes(swap.shift.startMinute)} – ${formatMinutes(swap.shift.endMinute)}`,
    }),
    link: `/dashboard/schedule?week=${mondayOf(swap.shift.date)}`,
  }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = swapActionSchema.safeParse(body);
    if (!parsed.success) return error("errors.invalidData", 400);
    const { action } = parsed.data;

    const swap = await loadSwap(id, ctx.organizationId);
    if (!swap) return error("schedule.swap.errors.notFound", 404);
    const fromName = `${swap.fromUser.firstName} ${swap.fromUser.lastName}`;
    const isPast = swap.shift.date < todayInZone();

    // ---------- Un collègue accepte ----------
    if (action === "accept") {
      if (swap.fromUserId === ctx.userId) return error("schedule.swap.errors.notFound", 404);
      if (swap.status !== "OPEN") return error("schedule.swap.errors.alreadyTaken", 409);
      if (isPast) return error("schedule.swap.errors.past", 400);
      const me = await prisma.user.findFirst({
        where: { id: ctx.userId, organizationId: ctx.organizationId, status: "ACTIVE" },
        select: { firstName: true, lastName: true, departmentId: true },
      });
      if (!me) return error("schedule.swap.errors.notFound", 404);
      const allowed = swap.targetUserId ? swap.targetUserId === ctx.userId : me.departmentId === swap.fromUser.departmentId;
      if (!allowed) return error("schedule.swap.errors.notFound", 404);
      const overlap = await findOverlappingShift({
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        date: swap.shift.date,
        startMinute: swap.shift.startMinute,
        endMinute: swap.shift.endMinute,
      });
      if (overlap) return error("schedule.swap.errors.overlapMine", 409);

      if (!(await transition(swap.id, "OPEN", { status: "ACCEPTED", takenById: ctx.userId }))) {
        return error("schedule.swap.errors.alreadyTaken", 409);
      }
      await audit(ctx, "SCHEDULE_SWAP_ACCEPTED", swap);
      const takerName = `${me.firstName} ${me.lastName}`;
      const approvers = (await swapApproverIds(ctx.organizationId, swap.fromUser.departmentId, me.departmentId)).filter(
        (uid) => uid !== swap.fromUserId && uid !== ctx.userId
      );
      await notify(ctx.organizationId, approvers, swap, "SCHEDULE_SWAP_ACCEPTED", "schedule.swap.notif.toApproveTitle", "schedule.swap.notif.toApproveBody", {
        from: fromName,
        taker: takerName,
      });
      await notify(ctx.organizationId, [swap.fromUserId], swap, "SCHEDULE_SWAP_ACCEPTED", "schedule.swap.notif.acceptedTitle", "schedule.swap.notif.acceptedBody", {
        taker: takerName,
      });
      return Response.json({ ok: true });
    }

    // ---------- Le collègue visé refuse ----------
    if (action === "decline") {
      if (swap.targetUserId !== ctx.userId) return error("schedule.swap.errors.notFound", 404);
      if (!(await transition(swap.id, "OPEN", { status: "DECLINED", decidedAt: new Date() }))) {
        return error("schedule.swap.errors.invalidState", 409);
      }
      await audit(ctx, "SCHEDULE_SWAP_DECLINED", swap);
      const me = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { firstName: true, lastName: true } });
      await notify(ctx.organizationId, [swap.fromUserId], swap, "SCHEDULE_SWAP_DECLINED", "schedule.swap.notif.declinedTitle", "schedule.swap.notif.declinedBody", {
        name: me ? `${me.firstName} ${me.lastName}` : "",
      });
      return Response.json({ ok: true });
    }

    // ---------- Celui qui cède annule ----------
    if (action === "cancel") {
      if (swap.fromUserId !== ctx.userId) return error("schedule.swap.errors.notFound", 404);
      if (!(await transition(swap.id, ["OPEN", "ACCEPTED"], { status: "CANCELLED", decidedAt: new Date() }))) {
        return error("schedule.swap.errors.invalidState", 409);
      }
      await audit(ctx, "SCHEDULE_SWAP_CANCELLED", swap);
      if (swap.status === "ACCEPTED") {
        await notify(ctx.organizationId, [swap.takenById], swap, "SCHEDULE_SWAP_CANCELLED", "schedule.swap.notif.cancelledTitle", "schedule.swap.notif.cancelledBody", {
          name: fromName,
        });
      }
      return Response.json({ ok: true });
    }

    // ---------- Responsable / admin : approuver ou refuser ----------
    if (swap.status !== "ACCEPTED" || !swap.takenById || !swap.takenBy) return error("schedule.swap.errors.invalidState", 409);
    if (!(await canScheduleUser(ctx, swap.fromUserId)) || !(await canScheduleUser(ctx, swap.takenById))) {
      return error("schedule.swap.errors.forbidden", 403);
    }
    const takerName = `${swap.takenBy.firstName} ${swap.takenBy.lastName}`;

    if (action === "reject") {
      if (!(await transition(swap.id, "ACCEPTED", { status: "REJECTED", decidedById: ctx.userId, decidedAt: new Date() }))) {
        return error("schedule.swap.errors.invalidState", 409);
      }
      await audit(ctx, "SCHEDULE_SWAP_REJECTED", swap);
      await notify(ctx.organizationId, [swap.fromUserId, swap.takenById], swap, "SCHEDULE_SWAP_REJECTED", "schedule.swap.notif.rejectedTitle", "schedule.swap.notif.rejectedBody");
      return Response.json({ ok: true });
    }

    // approve
    if (isPast) return error("schedule.swap.errors.past", 400);
    if (swap.shift.userId !== swap.fromUserId) return error("schedule.swap.errors.invalidState", 409);
    const overlap = await findOverlappingShift({
      organizationId: ctx.organizationId,
      userId: swap.takenById,
      date: swap.shift.date,
      startMinute: swap.shift.startMinute,
      endMinute: swap.shift.endMinute,
    });
    if (overlap) return error("schedule.swap.errors.overlapTaker", 409);

    const takenById = swap.takenById;
    const done = await prisma.$transaction(async (tx) => {
      const res = await tx.shiftSwap.updateMany({
        where: { id: swap.id, status: "ACCEPTED" },
        data: { status: "APPROVED", decidedById: ctx.userId, decidedAt: new Date() },
      });
      if (res.count !== 1) return false;
      const moved = await tx.shift.updateMany({
        where: { id: swap.shift.id, userId: swap.fromUserId },
        data: { userId: takenById },
      });
      if (moved.count !== 1) throw new Error("SHIFT_CHANGED");
      return true;
    }).catch((e: unknown) => {
      if (e instanceof Error && e.message === "SHIFT_CHANGED") return false;
      throw e;
    });
    if (!done) return error("schedule.swap.errors.invalidState", 409);

    await audit(ctx, "SCHEDULE_SWAP_APPROVED", swap);
    await notify(ctx.organizationId, [swap.fromUserId], swap, "SCHEDULE_SWAP_APPROVED", "schedule.swap.notif.approvedTitle", "schedule.swap.notif.approvedFromBody", {
      taker: takerName,
    });
    await notify(ctx.organizationId, [swap.takenById], swap, "SCHEDULE_SWAP_APPROVED", "schedule.swap.notif.approvedTitle", "schedule.swap.notif.approvedTakerBody");
    return Response.json({ ok: true });
  } catch (err) {
    const authResponse = handleAuthError(err);
    if (authResponse) return authResponse;
    console.error("[shift-swaps:update]", err);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
