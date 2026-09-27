import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { generateInviteCode } from "@/lib/invite-code";

// ------------------------------------------------------------
// Réservé à ORG_ADMIN/SUPER_ADMIN (pas MANAGER — même exception que la
// désactivation de comptes, 7.6) : voir/régénérer le code d'invitation qui
// permet aux employés de rejoindre l'organisation eux-mêmes (7.18).
// ------------------------------------------------------------

async function generateUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateInviteCode();
    const clash = await prisma.organization.findUnique({ where: { inviteCode: code } });
    if (!clash) return code;
  }
  throw new Error("Impossible de générer un code d'invitation unique après 20 tentatives.");
}

// GET -> renvoie le code actuel de l'organisation, en le générant au
// passage si elle n'en a pas encore (rétrocompatibilité pour les
// organisations créées avant cette fonctionnalité).
export async function GET() {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN", "SUPER_ADMIN"]);

    const organization = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { inviteCode: true },
    });
    if (!organization) {
      return Response.json({ error: "Organisation introuvable" }, { status: 404 });
    }

    let inviteCode = organization.inviteCode;
    if (!inviteCode) {
      inviteCode = await generateUniqueInviteCode();
      await prisma.organization.update({
        where: { id: ctx.organizationId },
        data: { inviteCode },
      });
    }

    return Response.json({ inviteCode });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST -> régénère le code (l'ancien cesse immédiatement de fonctionner).
export async function POST() {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN", "SUPER_ADMIN"]);

    const inviteCode = await generateUniqueInviteCode();
    await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: { inviteCode },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "USER_INVITE_CODE_REGENERATED",
      },
    });

    return Response.json({ inviteCode });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
