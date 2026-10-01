import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";
import { ensureLeaveTypes, LEAVE_COLORS, MAX_LEAVE_TYPES, parseDaysPerYear } from "@/lib/leave";

// POST /api/leave/types { name, daysPerYear, color } -> nouveau type de congé
// (admins de l'organisation, AUDIT.md 7.30).
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    const { t } = await getI18n();
    const body = await request.json().catch(() => null);

    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) return Response.json({ error: t("leave.errors.typeNameRequired") }, { status: 400 });
    const daysPerYear = parseDaysPerYear(body?.daysPerYear);
    if (daysPerYear === undefined) return Response.json({ error: t("leave.errors.invalidDays") }, { status: 400 });
    const color = (LEAVE_COLORS as readonly string[]).includes(body?.color) ? body.color : LEAVE_COLORS[1];

    await ensureLeaveTypes(ctx.organizationId);
    const count = await prisma.leaveType.count({ where: { organizationId: ctx.organizationId } });
    if (count >= MAX_LEAVE_TYPES) return Response.json({ error: t("leave.errors.tooManyTypes") }, { status: 400 });

    const type = await prisma.leaveType.create({
      data: { organizationId: ctx.organizationId, name, daysPerYear, color, position: count },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ABSENCE_TYPE_CREATED",
        targetId: type.id,
        metadata: { name },
      },
    });
    return Response.json({ type }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
