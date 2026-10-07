import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { shiftSchema } from "@/lib/validations/schedule";
import { canScheduleUser, findOverlappingShift, formatMinutes, mondayOf, parseTime } from "@/lib/schedule";
import { notifyUsersLocalized } from "@/lib/notifications";

// ------------------------------------------------------------
// PATCH /api/shifts/[id]  -> modifie un quart
// DELETE /api/shifts/[id] -> supprime un quart
// (AUDIT.md 7.36) Mêmes droits que la création. Si le quart était déjà
// PUBLIÉ, la ou les personnes concernées reçoivent une notification
// « Ton horaire a changé » et l'action est notée dans l'Historique.
// ------------------------------------------------------------

async function loadShift(id: string, organizationId: string) {
  return prisma.shift.findFirst({
    where: { id, organizationId },
    select: { id: true, userId: true, date: true, startMinute: true, endMinute: true, publishedAt: true },
  });
}

async function notifyChange(organizationId: string, userIds: string[], date: string, kind: "changed" | "removed") {
  await notifyUsersLocalized(organizationId, userIds, (t, { formatDate }) => ({
    type: kind === "removed" ? "SCHEDULE_SHIFT_DELETED" : "SCHEDULE_SHIFT_UPDATED",
    title: t("schedule.notif.changedTitle"),
    body: t(kind === "removed" ? "schedule.notif.removedBody" : "schedule.notif.changedBody", {
      date: formatDate(`${date}T12:00:00Z`, { weekday: "long", month: "long", day: "numeric" }),
    }),
    link: `/dashboard/schedule?week=${mondayOf(date)}`,
  }));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const existing = await loadShift(id, ctx.organizationId);
    if (!existing || !(await canScheduleUser(ctx, existing.userId))) {
      return Response.json({ error: "schedule.errors.notFound" }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsed = shiftSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "errors.invalidData" }, { status: 400 });
    }
    const { userId, date, start, end, position, note } = parsed.data;
    if (userId !== existing.userId && !(await canScheduleUser(ctx, userId))) {
      return Response.json({ error: "schedule.errors.forbidden" }, { status: 403 });
    }

    const startMinute = parseTime(start)!;
    const endMinute = parseTime(end)!;
    const overlap = await findOverlappingShift({
      organizationId: ctx.organizationId,
      userId,
      date,
      startMinute,
      endMinute,
      excludeId: existing.id,
    });
    if (overlap) {
      return Response.json({ error: "schedule.errors.overlap" }, { status: 409 });
    }

    await prisma.shift.update({
      where: { id: existing.id },
      data: { userId, date, startMinute, endMinute, position: position || null, note: note || null },
    });

    if (existing.publishedAt) {
      await prisma.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "SCHEDULE_SHIFT_UPDATED",
          targetId: existing.id,
          metadata: {
            date,
            before: `${existing.date} ${formatMinutes(existing.startMinute)}-${formatMinutes(existing.endMinute)}`,
            after: `${date} ${start}-${end}`,
          },
        },
      });
      await notifyChange(ctx.organizationId, [existing.userId, userId], date, "changed");
    }

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[shifts:update]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    const existing = await loadShift(id, ctx.organizationId);
    if (!existing || !(await canScheduleUser(ctx, existing.userId))) {
      return Response.json({ error: "schedule.errors.notFound" }, { status: 404 });
    }

    await prisma.shift.delete({ where: { id: existing.id } });

    if (existing.publishedAt) {
      await prisma.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "SCHEDULE_SHIFT_DELETED",
          targetId: existing.id,
          metadata: { date: existing.date },
        },
      });
      await notifyChange(ctx.organizationId, [existing.userId], existing.date, "removed");
    }

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[shifts:delete]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
