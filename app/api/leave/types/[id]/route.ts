import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";
import { LEAVE_COLORS, parseDaysPerYear } from "@/lib/leave";

// PATCH /api/leave/types/[id] { name?, daysPerYear?, color?, isActive? }
// (admins, AUDIT.md 7.30). Un type n'est jamais supprimé (des demandes y sont
// rattachées) : on le désactive. Nom vide sur un type par défaut = nom traduit.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    const { t } = await getI18n();
    const { id } = await params;
    const body = await request.json().catch(() => null);

    const type = await prisma.leaveType.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!type) return Response.json({ error: t("leave.errors.notFound") }, { status: 404 });

    const data: { name?: string | null; daysPerYear?: number | null; color?: string; isActive?: boolean } = {};
    if ("name" in (body ?? {})) {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
      if (!name && !type.code) return Response.json({ error: t("leave.errors.typeNameRequired") }, { status: 400 });
      data.name = name || null;
    }
    if ("daysPerYear" in (body ?? {})) {
      const days = parseDaysPerYear(body.daysPerYear);
      if (days === undefined) return Response.json({ error: t("leave.errors.invalidDays") }, { status: 400 });
      data.daysPerYear = days;
    }
    if ("color" in (body ?? {})) {
      if (!(LEAVE_COLORS as readonly string[]).includes(body.color)) {
        return Response.json({ error: t("leave.errors.invalidColor") }, { status: 400 });
      }
      data.color = body.color;
    }
    if (typeof body?.isActive === "boolean") data.isActive = body.isActive;

    await prisma.leaveType.update({ where: { id }, data });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ABSENCE_TYPE_UPDATED",
        targetId: id,
        metadata: { name: data.name ?? type.name ?? type.code },
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
