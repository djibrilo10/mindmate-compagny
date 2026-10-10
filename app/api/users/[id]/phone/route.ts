import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { normalizePhone } from "@/lib/phone";
import { requirePrimaryAdmin } from "@/lib/admins";

// ------------------------------------------------------------
// PATCH /api/users/[id]/phone { phone } (AUDIT.md 7.40)
// L'admin ajoute, change ou retire ("") le numéro de téléphone d'un employé,
// pour que celui-ci puisse se connecter avec son numéro. Réservé aux admins ;
// un compte doit garder au moins un moyen de connexion (courriel ou téléphone).
// ------------------------------------------------------------

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN", "SUPER_ADMIN"]);
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const raw = typeof body?.phone === "string" ? body.phone.trim() : "";
    const phone = raw ? normalizePhone(raw) : null;
    if (raw && !phone) {
      return Response.json({ error: "validation.phoneInvalid" }, { status: 400 });
    }

    const target = await prisma.user.findFirst({
      where: { id, organizationId: ctx.organizationId, ...VISIBLE_USER },
      select: { id: true, email: true, role: true },
    });
    if (!target) return Response.json({ error: "departments.employees.phone.notFound" }, { status: 404 });
    // Le téléphone d'un AUTRE admin (moyen de connexion) : seul l'admin
    // principal y touche, comme pour tout ce qui concerne les admins (7.22, 7.50).
    if (target.role === "ORG_ADMIN" && target.id !== ctx.userId) {
      await requirePrimaryAdmin(ctx);
    }
    if (!phone && !target.email) {
      return Response.json({ error: "departments.employees.phone.needOneLogin" }, { status: 400 });
    }

    if (phone) {
      const taken = await prisma.user.findFirst({
        where: { organizationId: ctx.organizationId, phone, id: { not: target.id } },
        select: { id: true },
      });
      if (taken) return Response.json({ error: "errors.phoneTakenInOrg" }, { status: 409 });
    }

    await prisma.user.update({ where: { id: target.id }, data: { phone } });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "USER_PHONE_UPDATED",
        targetId: target.id,
      },
    });

    return Response.json({ ok: true, phone });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[users:phone]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
