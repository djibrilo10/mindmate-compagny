import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { requirePrimaryAdmin } from "@/lib/admins";
import { getI18n } from "@/lib/i18n/server";
import { syncManagerRole } from "@/lib/departments";

// DELETE /api/departments/[id]/managers/[userId] -> retirer un responsable
// (admin PRINCIPAL, AUDIT.md 7.34). S'il ne gère plus aucun département, il
// redevient employé automatiquement.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    await requirePrimaryAdmin(ctx);
    const { t } = await getI18n();
    const { id, userId } = await params;

    const row = await prisma.departmentManager.findFirst({
      where: { departmentId: id, userId, organizationId: ctx.organizationId },
      include: { department: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
    });
    if (!row) return Response.json({ error: t("departments.errors.notFound") }, { status: 404 });

    await prisma.departmentManager.delete({ where: { departmentId_userId: { departmentId: id, userId } } });
    await syncManagerRole(userId);
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "DEPARTMENT_MANAGER_REMOVED",
        targetId: id,
        metadata: { name: `${row.user.firstName} ${row.user.lastName}`, department: row.department.name },
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
