import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";
import { VISIBLE_USER } from "@/lib/visibility";

// POST /api/leave/adjustments { userId, leaveTypeId, year, days, note }
// -> ajoute ou retire des jours au solde d'UNE personne pour une année de
// congés (ancienneté, report, correction). Admins seulement (AUDIT.md 7.30).
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    const { t } = await getI18n();
    const body = await request.json().catch(() => null);

    const days = Number(String(body?.days ?? "").replace(",", "."));
    if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 366 || Math.round(days * 2) !== days * 2) {
      return Response.json({ error: t("leave.errors.invalidAdjustment") }, { status: 400 });
    }
    const year = Number(body?.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return Response.json({ error: t("errors.invalidData") }, { status: 400 });
    }
    const [user, type] = await Promise.all([
      typeof body?.userId === "string"
        ? prisma.user.findFirst({ where: { id: body.userId, organizationId: ctx.organizationId, ...VISIBLE_USER } })
        : null,
      typeof body?.leaveTypeId === "string"
        ? prisma.leaveType.findFirst({ where: { id: body.leaveTypeId, organizationId: ctx.organizationId } })
        : null,
    ]);
    if (!user) return Response.json({ error: t("leave.errors.userNotFound") }, { status: 404 });
    if (!type) return Response.json({ error: t("leave.errors.invalidType") }, { status: 400 });

    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 200) : "";
    const adjustment = await prisma.leaveBalanceAdjustment.create({
      data: {
        organizationId: ctx.organizationId,
        userId: user.id,
        leaveTypeId: type.id,
        year,
        days,
        note: note || null,
        createdById: ctx.userId,
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ABSENCE_BALANCE_ADJUSTED",
        targetId: adjustment.id,
        metadata: { name: `${user.firstName} ${user.lastName}`, days, year },
      },
    });
    return Response.json({ adjustment }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
