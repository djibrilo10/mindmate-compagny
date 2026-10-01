import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { notifyUsersLocalized } from "@/lib/notifications";
import { getI18n } from "@/lib/i18n/server";
import { approverScope, closedDaysFor, countLeaveDays, ensureLeaveTypes, MAX_REQUEST_DAYS, NOT_RETIRED, parseDay } from "@/lib/leave";
import { formatLeaveDates, leaveTypeLabel } from "@/lib/leave-format";

// ------------------------------------------------------------
// Congés et absences (voir AUDIT.md 7.30).
// POST -> l'employé connecté demande un congé : type, dates, demi-journée,
//         commentaire facultatif. Les jours ouvrables sont calculés ici
//         (jamais envoyés par le navigateur).
// GET  -> ses propres demandes + celles qu'il peut approuver.
// ------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const { t } = await getI18n();
    const body = await request.json().catch(() => null);

    await ensureLeaveTypes(ctx.organizationId);
    const leaveType =
      typeof body?.leaveTypeId === "string"
        ? await prisma.leaveType.findFirst({
            where: { id: body.leaveTypeId, organizationId: ctx.organizationId, isActive: true, ...NOT_RETIRED },
          })
        : null;
    if (!leaveType) return Response.json({ error: t("leave.errors.invalidType") }, { status: 400 });

    const start = parseDay(body?.startDate);
    const end = parseDay(body?.endDate ?? body?.startDate);
    if (!start || !end) return Response.json({ error: t("leave.errors.invalidDates") }, { status: 400 });
    if (end < start) return Response.json({ error: t("leave.errors.endBeforeStart") }, { status: 400 });
    if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_REQUEST_DAYS) {
      return Response.json({ error: t("leave.errors.tooLong") }, { status: 400 });
    }

    const halfDay = body?.halfDay === "AM" || body?.halfDay === "PM" ? (body.halfDay as "AM" | "PM") : null;
    if (halfDay && end.getTime() !== start.getTime()) {
      return Response.json({ error: t("leave.errors.halfDaySingle") }, { status: 400 });
    }
    // Journées entières de congé programmé par l'entreprise : jamais décomptées (7.31).
    const closed = await closedDaysFor(ctx.organizationId, ctx.departmentId, start, end);
    const days = countLeaveDays(start, end, halfDay, closed);
    if (days === 0) {
      return Response.json({ error: t("leave.errors.noWorkingDay") }, { status: 400 });
    }

    // Pas deux demandes actives qui se chevauchent pour la même personne.
    const overlap = await prisma.absenceRequest.findFirst({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        status: { in: ["PENDING", "APPROVED"] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { id: true },
    });
    if (overlap) return Response.json({ error: t("leave.errors.overlapOwn") }, { status: 409 });

    const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 1000) : "";
    const absence = await prisma.absenceRequest.create({
      data: {
        organizationId: ctx.organizationId, // <-- vient du token, jamais du client
        userId: ctx.userId,
        leaveTypeId: leaveType.id,
        startDate: start,
        endDate: end,
        halfDay,
        days,
        reason: comment,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ABSENCE_REQUESTED",
        targetId: absence.id,
        metadata: { days },
      },
    });

    // Approbateurs : les admins + le(s) responsable(s) du département de la personne.
    const me = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { firstName: true, lastName: true, departmentId: true },
    });
    const approvers = await prisma.user.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "ACTIVE",
        id: { not: ctx.userId },
        // Responsables du département de la personne (7.34).
        OR: [
          { role: "ORG_ADMIN" },
          ...(me?.departmentId ? [{ managedDepartments: { some: { departmentId: me.departmentId } } }] : []),
        ],
      },
      select: { id: true },
    });
    await notifyUsersLocalized(ctx.organizationId, approvers.map((a) => a.id), (tt, i18n) => ({
      type: "ABSENCE_REQUESTED",
      title: tt("leave.notif.requestedTitle"),
      body: tt("leave.notif.requestedBody", {
        name: `${me?.firstName ?? ""} ${me?.lastName ?? ""}`.trim(),
        type: leaveTypeLabel(tt, leaveType),
        dates: formatLeaveDates(i18n, start, end, halfDay),
      }),
      link: "/dashboard/absences?tab=approvals",
    }));

    return Response.json({ absence }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ctx = await requireAuth();
    const scope = approverScope(ctx);
    const absences = await prisma.absenceRequest.findMany({
      where: scope
        ? { OR: [scope, { organizationId: ctx.organizationId, userId: ctx.userId }] }
        : { organizationId: ctx.organizationId, userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { firstName: true, lastName: true } },
        leaveType: { select: { id: true, code: true, name: true, color: true } },
      },
    });
    return Response.json({ absences });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
