import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError, ForbiddenError } from "@/lib/session-guard";
import { requirePrimaryAdmin } from "@/lib/admins";
import { notifyUser } from "@/lib/notifications";

// ------------------------------------------------------------
// Gestion d'UN co-admin par l'ADMIN PRINCIPAL (voir AUDIT.md 7.22).
// PATCH  { status: "ACTIVE" | "DISABLED" } -> activer / désactiver.
//        Un co-admin désactivé ne peut plus se connecter ; son accès est
//        coupé immédiatement (session-guard relit le statut en base).
// DELETE { disableAccount?: boolean }        -> retirer les droits admin :
//        la personne redevient EMPLOYEE (place libérée). Avec
//        disableAccount, son compte est en plus désactivé. On ne supprime
//        jamais réellement un utilisateur (traçabilité, voir schema.prisma).
// ------------------------------------------------------------

async function findCoAdmin(organizationId: string, id: string, primaryAdminId: string) {
  if (id === primaryAdminId) {
    throw new ForbiddenError("L'administrateur principal ne peut pas être modifié ici");
  }
  return prisma.user.findFirst({
    where: { id, organizationId, role: "ORG_ADMIN" },
    select: { id: true, firstName: true, lastName: true, status: true },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    await requirePrimaryAdmin(ctx);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const status = body?.status;
    if (status !== "ACTIVE" && status !== "DISABLED") {
      return Response.json({ error: "Statut invalide" }, { status: 400 });
    }

    const coAdmin = await findCoAdmin(ctx.organizationId, id, ctx.userId);
    if (!coAdmin) {
      return Response.json({ error: "Co-admin introuvable" }, { status: 404 });
    }

    await prisma.user.update({ where: { id: coAdmin.id }, data: { status } });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: status === "DISABLED" ? "USER_ADMIN_DISABLED" : "USER_ADMIN_REACTIVATED",
        targetId: coAdmin.id,
        metadata: { name: `${coAdmin.firstName} ${coAdmin.lastName}` },
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

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const disableAccount = body?.disableAccount === true;

    const coAdmin = await findCoAdmin(ctx.organizationId, id, ctx.userId);
    if (!coAdmin) {
      return Response.json({ error: "Co-admin introuvable" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: coAdmin.id },
      data: { role: "EMPLOYEE", ...(disableAccount ? { status: "DISABLED" } : {}) },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "USER_ADMIN_REMOVED",
        targetId: coAdmin.id,
        metadata: {
          name: `${coAdmin.firstName} ${coAdmin.lastName}`,
          reason: disableAccount ? "removed_and_disabled" : "removed",
        },
      },
    });

    if (!disableAccount) {
      await notifyUser(ctx.organizationId, coAdmin.id, {
        type: "USER_ADMIN_REMOVED",
        title: "Droits d'administration retirés",
        body: "Votre compte est redevenu un compte employé.",
        link: "/dashboard",
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
