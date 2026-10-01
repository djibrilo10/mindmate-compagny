import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";
import { notifyUsersLocalized } from "@/lib/notifications";
import { formatCompanyLeaveDates } from "@/lib/leave-format";
import { VISIBLE_USER } from "@/lib/visibility";

// DELETE /api/leave/company/[id] -> un admin retire un congé programmé
// (AUDIT.md 7.31). S'il n'est pas encore terminé, les personnes concernées
// sont prévenues de l'annulation.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    const { t } = await getI18n();
    const { id } = await params;

    const leave = await prisma.companyLeave.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!leave) return Response.json({ error: t("leave.errors.notFound") }, { status: 404 });

    await prisma.companyLeave.delete({ where: { id } });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ABSENCE_COMPANY_LEAVE_DELETED",
        targetId: id,
        metadata: { title: leave.title },
      },
    });

    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    if (leave.endDate >= today) {
      const recipients = await prisma.user.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: "ACTIVE",
          id: { not: ctx.userId },
          ...VISIBLE_USER,
          ...(leave.departmentIds.length ? { departmentId: { in: leave.departmentIds } } : {}),
        },
        select: { id: true },
      });
      await notifyUsersLocalized(ctx.organizationId, recipients.map((r) => r.id), (tt, i18n) => ({
        type: "ABSENCE_COMPANY_LEAVE_DELETED",
        title: tt("leave.company.notifCancelledTitle", { title: leave.title }),
        body: formatCompanyLeaveDates(i18n, leave),
        link: "/dashboard/absences",
      }));
    }

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
