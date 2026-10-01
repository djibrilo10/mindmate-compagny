import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { requirePrimaryAdmin } from "@/lib/admins";
import { getI18n } from "@/lib/i18n/server";
import { syncManagerRole } from "@/lib/departments";
import { notifyUsersLocalized } from "@/lib/notifications";
import { VISIBLE_USER } from "@/lib/visibility";

// POST /api/departments/[id]/managers { userId } -> nommer un responsable
// (admin PRINCIPAL, AUDIT.md 7.34). La personne devient MANAGER et reçoit
// une notification. Un admin ne peut pas être nommé (il voit déjà tout).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    await requirePrimaryAdmin(ctx);
    const { t } = await getI18n();
    const { id } = await params;
    const body = await request.json().catch(() => null);

    const [department, user] = await Promise.all([
      prisma.department.findFirst({ where: { id, organizationId: ctx.organizationId } }),
      typeof body?.userId === "string"
        ? prisma.user.findFirst({
            where: { id: body.userId, organizationId: ctx.organizationId, status: "ACTIVE", ...VISIBLE_USER },
            select: { id: true, role: true, firstName: true, lastName: true },
          })
        : null,
    ]);
    if (!department) return Response.json({ error: t("departments.errors.notFound") }, { status: 404 });
    if (!user) return Response.json({ error: t("leave.errors.userNotFound") }, { status: 404 });
    if (user.role === "ORG_ADMIN") return Response.json({ error: t("departments.errors.adminCannotManage") }, { status: 400 });

    await prisma.departmentManager.upsert({
      where: { departmentId_userId: { departmentId: id, userId: user.id } },
      create: { organizationId: ctx.organizationId, departmentId: id, userId: user.id },
      update: {},
    });
    await syncManagerRole(user.id);

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "DEPARTMENT_MANAGER_ADDED",
        targetId: id,
        metadata: { name: `${user.firstName} ${user.lastName}`, department: department.name },
      },
    });
    await notifyUsersLocalized(ctx.organizationId, [user.id], (tt) => ({
      type: "DEPARTMENT_MANAGER_ADDED",
      title: tt("departments.notif.managerTitle"),
      body: tt("departments.notif.managerBody", { department: department.name }),
      link: "/dashboard/absences?tab=approvals",
    }));
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
