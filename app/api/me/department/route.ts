import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";
import { departmentManagerIds } from "@/lib/departments";
import { notifyUsersLocalized } from "@/lib/notifications";

// POST /api/me/department { departmentId } -> la personne choisit SON
// département, UNE SEULE FOIS (fenêtre à la connexion pour les comptes créés
// avant les départements, AUDIT.md 7.34). Ensuite, seuls les admins peuvent
// le changer (page Employés).
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const { t } = await getI18n();
    const body = await request.json().catch(() => null);

    const me = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { departmentConfirmedAt: true, firstName: true, lastName: true },
    });
    if (!me) return Response.json({ error: t("leave.errors.userNotFound") }, { status: 404 });
    if (me.departmentConfirmedAt) return Response.json({ error: t("departments.errors.alreadyChosen") }, { status: 409 });

    const department =
      typeof body?.departmentId === "string"
        ? await prisma.department.findFirst({ where: { id: body.departmentId, organizationId: ctx.organizationId } })
        : null;
    if (!department) return Response.json({ error: t("departments.errors.chooseOne") }, { status: 400 });

    const updated = await prisma.user.updateMany({
      where: { id: ctx.userId, departmentConfirmedAt: null },
      data: { departmentId: department.id, departmentConfirmedAt: new Date() },
    });
    if (updated.count === 0) return Response.json({ error: t("departments.errors.alreadyChosen") }, { status: 409 });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "USER_DEPARTMENT_CHOSEN",
        targetId: department.id,
        metadata: { department: department.name },
      },
    });
    const managers = (await departmentManagerIds(department.id)).filter((id) => id !== ctx.userId);
    await notifyUsersLocalized(ctx.organizationId, managers, (tt) => ({
      type: "USER_DEPARTMENT_CHOSEN",
      title: tt("departments.notif.joinedTitle", { department: department.name }),
      body: tt("departments.notif.joinedBody", { name: `${me.firstName} ${me.lastName}` }),
      link: "/dashboard/employees",
    }));
    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
