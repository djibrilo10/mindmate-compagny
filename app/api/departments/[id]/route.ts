import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { requirePrimaryAdmin } from "@/lib/admins";
import { getI18n } from "@/lib/i18n/server";
import { DEPARTMENT_COLORS, syncManagerRole } from "@/lib/departments";

// PATCH  /api/departments/[id] { name?, color? } -> renommer / changer la couleur.
// DELETE /api/departments/[id] { moveToId? }     -> supprimer ; s'il a des
//   membres, ils sont d'abord déplacés vers moveToId (obligatoire).
// Admin PRINCIPAL seulement (AUDIT.md 7.34).

async function load(id: string, organizationId: string) {
  return prisma.department.findFirst({ where: { id, organizationId } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    await requirePrimaryAdmin(ctx);
    const { t } = await getI18n();
    const { id } = await params;
    const department = await load(id, ctx.organizationId);
    if (!department) return Response.json({ error: t("departments.errors.notFound") }, { status: 404 });

    const body = await request.json().catch(() => null);
    const data: { name?: string; color?: string } = {};
    if (typeof body?.name === "string") {
      const name = body.name.trim().replace(/\s+/g, " ").slice(0, 60);
      if (name.length < 2) return Response.json({ error: t("departments.errors.nameRequired") }, { status: 400 });
      data.name = name;
    }
    if (body?.color !== undefined) {
      if (!(DEPARTMENT_COLORS as readonly string[]).includes(body.color)) {
        return Response.json({ error: t("leave.errors.invalidColor") }, { status: 400 });
      }
      data.color = body.color;
    }

    try {
      await prisma.department.update({ where: { id }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return Response.json({ error: t("departments.errors.nameTaken") }, { status: 409 });
      }
      throw error;
    }
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "DEPARTMENT_UPDATED",
        targetId: id,
        metadata: { name: data.name ?? department.name },
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    await requirePrimaryAdmin(ctx);
    const { t } = await getI18n();
    const { id } = await params;
    const department = await load(id, ctx.organizationId);
    if (!department) return Response.json({ error: t("departments.errors.notFound") }, { status: 404 });

    const total = await prisma.department.count({ where: { organizationId: ctx.organizationId } });
    if (total <= 1) return Response.json({ error: t("departments.errors.lastOne") }, { status: 400 });

    const body = await request.json().catch(() => null);
    const members = await prisma.user.count({ where: { departmentId: id } });
    let moveTo: { id: string; name: string } | null = null;
    if (members > 0) {
      moveTo =
        typeof body?.moveToId === "string" && body.moveToId !== id
          ? await prisma.department.findFirst({
              where: { id: body.moveToId, organizationId: ctx.organizationId },
              select: { id: true, name: true },
            })
          : null;
      if (!moveTo) return Response.json({ error: t("departments.errors.moveRequired") }, { status: 400 });
    }

    const managers = await prisma.departmentManager.findMany({ where: { departmentId: id }, select: { userId: true } });
    await prisma.$transaction(async (tx) => {
      if (moveTo) await tx.user.updateMany({ where: { departmentId: id }, data: { departmentId: moveTo.id } });
      await tx.department.delete({ where: { id } }); // les nominations de responsables suivent (cascade)
    });
    // Un responsable qui ne gère plus rien redevient employé.
    for (const m of managers) await syncManagerRole(m.userId);

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "DEPARTMENT_DELETED",
        targetId: id,
        metadata: { name: department.name, movedTo: moveTo?.name ?? null, members },
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
