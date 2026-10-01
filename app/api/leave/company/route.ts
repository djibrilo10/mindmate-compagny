import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";
import { notifyUsersLocalized } from "@/lib/notifications";
import { MAX_REQUEST_DAYS, parseDay } from "@/lib/leave";
import { formatCompanyLeaveDates } from "@/lib/leave-format";
import { VISIBLE_USER } from "@/lib/visibility";

// POST /api/leave/company -> un admin programme un congé pour toute
// l'entreprise ou certains départements (AUDIT.md 7.31) :
// { title, message?, startDate, endDate?, startTime?, endTime?, departmentIds? }
// Les personnes concernées reçoivent une notification dans leur langue.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    const { t } = await getI18n();
    const body = await request.json().catch(() => null);

    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
    if (title.length < 2) return Response.json({ error: t("leave.company.errors.titleRequired") }, { status: 400 });
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";

    const start = parseDay(body?.startDate);
    const end = parseDay(body?.endDate || body?.startDate);
    if (!start || !end) return Response.json({ error: t("leave.errors.invalidDates") }, { status: 400 });
    if (end < start) return Response.json({ error: t("leave.errors.endBeforeStart") }, { status: 400 });
    if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_REQUEST_DAYS) {
      return Response.json({ error: t("leave.errors.tooLong") }, { status: 400 });
    }
    const startTime = typeof body?.startTime === "string" && TIME.test(body.startTime) ? body.startTime : null;
    const endTime = typeof body?.endTime === "string" && TIME.test(body.endTime) ? body.endTime : null;
    if (startTime && endTime && start.getTime() === end.getTime() && endTime <= startTime) {
      return Response.json({ error: t("leave.company.errors.timeOrder") }, { status: 400 });
    }

    // Départements : uniquement ceux de CETTE organisation ; liste vide = tout le monde.
    const requested: string[] = Array.isArray(body?.departmentIds)
      ? body.departmentIds.filter((x: unknown): x is string => typeof x === "string")
      : [];
    const departments = requested.length
      ? await prisma.department.findMany({
          where: { organizationId: ctx.organizationId, id: { in: requested } },
          select: { id: true },
        })
      : [];
    const departmentIds = departments.map((d) => d.id);
    if (requested.length > 0 && departmentIds.length === 0) {
      return Response.json({ error: t("leave.company.errors.noDepartment") }, { status: 400 });
    }

    const leave = await prisma.companyLeave.create({
      data: {
        organizationId: ctx.organizationId,
        title,
        message: message || null,
        startDate: start,
        endDate: end,
        startTime,
        endTime,
        departmentIds,
        createdById: ctx.userId,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ABSENCE_COMPANY_LEAVE_CREATED",
        targetId: leave.id,
        metadata: { title },
      },
    });

    const recipients = await prisma.user.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "ACTIVE",
        id: { not: ctx.userId },
        ...VISIBLE_USER,
        ...(departmentIds.length ? { departmentId: { in: departmentIds } } : {}),
      },
      select: { id: true },
    });
    await notifyUsersLocalized(ctx.organizationId, recipients.map((r) => r.id), (tt, i18n) => ({
      type: "ABSENCE_COMPANY_LEAVE_CREATED",
      title: tt("leave.company.notifTitle", { title }),
      body: formatCompanyLeaveDates(i18n, leave),
      link: "/dashboard/absences",
    }));

    return Response.json({ leave }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
