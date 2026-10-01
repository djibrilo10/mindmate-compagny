import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";

// PATCH /api/leave/settings { yearStartMonth: 1..12 } -> début de l'année de
// congés (admins, AUDIT.md 7.30).
export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    const { t } = await getI18n();
    const body = await request.json().catch(() => null);
    const month = Number(body?.yearStartMonth);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return Response.json({ error: t("leave.errors.invalidMonth") }, { status: 400 });
    }
    await prisma.organization.update({ where: { id: ctx.organizationId }, data: { leaveYearStartMonth: month } });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ABSENCE_SETTINGS_UPDATED",
        metadata: { yearStartMonth: month },
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
