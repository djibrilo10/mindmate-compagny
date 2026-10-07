import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { VISIBLE_USER } from "@/lib/visibility";
import { isDateString, mondayOf } from "@/lib/schedule";
import { MAX_SCHEDULE_FILE_SIZE, canManageScheduleFileFor, scheduleFileMimeType } from "@/lib/schedule-files";
import { notifyUsersLocalized } from "@/lib/notifications";

// ------------------------------------------------------------
// POST /api/schedule-files (multipart, AUDIT.md 7.39)
// Champs : file, week ("AAAA-MM-JJ"), departmentId ("" = tous les employés),
// title (facultatif), notify ("1" = prévenir les employés concernés).
// Admin : pour tout le monde ou un département ; responsable : seulement
// pour un département qu'il gère.
// ------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    if (ctx.role !== "ORG_ADMIN" && ctx.role !== "MANAGER") {
      return Response.json({ error: "schedule.errors.forbidden" }, { status: 403 });
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File) || file.size === 0) {
      return Response.json({ error: "schedule.upload.errors.noFile" }, { status: 400 });
    }
    const mimeType = scheduleFileMimeType(file.name);
    if (!mimeType) {
      return Response.json({ error: "schedule.upload.errors.badType" }, { status: 400 });
    }
    if (file.size > MAX_SCHEDULE_FILE_SIZE) {
      return Response.json({ error: "schedule.upload.errors.tooBig" }, { status: 400 });
    }

    const weekRaw = String(form.get("week") ?? "");
    if (!isDateString(weekRaw)) {
      return Response.json({ error: "schedule.errors.dateInvalid" }, { status: 400 });
    }
    const week = mondayOf(weekRaw);

    const departmentRaw = String(form.get("departmentId") ?? "");
    let departmentId: string | null = null;
    if (departmentRaw) {
      const department = await prisma.department.findFirst({
        where: { id: departmentRaw, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!department) return Response.json({ error: "schedule.errors.forbidden" }, { status: 403 });
      departmentId = department.id;
    }
    if (!(await canManageScheduleFileFor(ctx, departmentId))) {
      return Response.json({ error: "schedule.upload.errors.forbiddenScope" }, { status: 403 });
    }

    const fileName = file.name.slice(0, 200);
    const titleRaw = String(form.get("title") ?? "").trim().slice(0, 120);
    const title = titleRaw || fileName.replace(/\.[^.]+$/, "");

    const created = await prisma.scheduleFile.create({
      data: {
        organizationId: ctx.organizationId,
        week,
        departmentId,
        title,
        fileName,
        mimeType,
        fileSize: file.size,
        data: Buffer.from(await file.arrayBuffer()),
        uploadedById: ctx.userId,
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "SCHEDULE_FILE_UPLOADED",
        targetId: created.id,
        metadata: { week, fileName, departmentId },
      },
    });

    if (form.get("notify") === "1") {
      const recipients = await prisma.user.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: "ACTIVE",
          ...VISIBLE_USER,
          id: { not: ctx.userId },
          ...(departmentId ? { departmentId } : {}),
        },
        select: { id: true },
      });
      await notifyUsersLocalized(ctx.organizationId, recipients.map((r) => r.id), (t, { formatDate }) => ({
        type: "SCHEDULE_FILE_UPLOADED",
        title: t("schedule.upload.notifTitle"),
        body: t("schedule.upload.notifBody", {
          date: formatDate(`${week}T12:00:00Z`, { month: "long", day: "numeric" }),
          title,
        }),
        link: `/dashboard/schedule?week=${week}`,
      }));
    }

    return Response.json({ id: created.id }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[schedule-files:upload]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
