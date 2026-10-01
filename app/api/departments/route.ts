import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { requirePrimaryAdmin } from "@/lib/admins";
import { getI18n } from "@/lib/i18n/server";
import { DEPARTMENT_COLORS, MAX_DEPARTMENTS } from "@/lib/departments";

// POST /api/departments { name, color } -> nouveau département (admin
// PRINCIPAL seulement, AUDIT.md 7.34).
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    await requirePrimaryAdmin(ctx);
    const { t } = await getI18n();
    const body = await request.json().catch(() => null);

    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
    if (name.length < 2) return Response.json({ error: t("departments.errors.nameRequired") }, { status: 400 });
    const color = (DEPARTMENT_COLORS as readonly string[]).includes(body?.color) ? body.color : DEPARTMENT_COLORS[2];

    const count = await prisma.department.count({ where: { organizationId: ctx.organizationId } });
    if (count >= MAX_DEPARTMENTS) return Response.json({ error: t("departments.errors.tooMany") }, { status: 400 });

    try {
      const department = await prisma.department.create({
        data: { organizationId: ctx.organizationId, name, color },
      });
      await prisma.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "DEPARTMENT_CREATED",
          targetId: department.id,
          metadata: { name },
        },
      });
      return Response.json({ department }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return Response.json({ error: t("departments.errors.nameTaken") }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
