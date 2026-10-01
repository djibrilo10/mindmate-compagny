import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";
import { notifyUsersLocalized } from "@/lib/notifications";
import { VISIBLE_USER } from "@/lib/visibility";

// POST /api/users/department { userIds: string[], departmentId } -> un admin
// change le département d'une ou plusieurs personnes (page Employés,
// AUDIT.md 7.34). Les personnes déplacées sont prévenues.
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    const { t } = await getI18n();
    const body = await request.json().catch(() => null);

    const ids: string[] = Array.isArray(body?.userIds)
      ? Array.from(new Set(body.userIds.filter((x: unknown): x is string => typeof x === "string"))).slice(0, 1000) as string[]
      : [];
    if (ids.length === 0) return Response.json({ error: t("errors.invalidData") }, { status: 400 });
    const department =
      typeof body?.departmentId === "string"
        ? await prisma.department.findFirst({ where: { id: body.departmentId, organizationId: ctx.organizationId } })
        : null;
    if (!department) return Response.json({ error: t("departments.errors.notFound") }, { status: 404 });

    const users = await prisma.user.findMany({
      where: { id: { in: ids }, organizationId: ctx.organizationId, ...VISIBLE_USER, departmentId: { not: department.id } },
      select: { id: true, firstName: true, lastName: true },
    });
    if (users.length === 0) return Response.json({ ok: true, moved: 0 });

    await prisma.user.updateMany({
      where: { id: { in: users.map((u) => u.id) } },
      data: { departmentId: department.id, departmentConfirmedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "USER_DEPARTMENT_CHANGED",
        targetId: department.id,
        metadata: {
          department: department.name,
          count: users.length,
          name: users.length === 1 ? `${users[0].firstName} ${users[0].lastName}` : null,
        },
      },
    });
    await notifyUsersLocalized(
      ctx.organizationId,
      users.map((u) => u.id).filter((id) => id !== ctx.userId),
      (tt) => ({
        type: "USER_DEPARTMENT_CHANGED",
        title: tt("departments.notif.movedTitle"),
        body: tt("departments.notif.movedBody", { department: department.name }),
        link: "/dashboard/departments",
      })
    );
    return Response.json({ ok: true, moved: users.length });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
