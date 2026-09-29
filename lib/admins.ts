import { prisma } from "@/lib/prisma";
import { ForbiddenError, type AuthContext } from "@/lib/session-guard";

// ------------------------------------------------------------
// Équipe d'administration d'une organisation (voir AUDIT.md 7.22).
//
// - 1 admin PRINCIPAL (Organization.primaryAdminId) : le créateur de
//   l'organisation. Seul à pouvoir ajouter, désactiver/réactiver, retirer
//   ou remplacer les co-admins.
// - Jusqu'à MAX_CO_ADMINS co-admins : rôle ORG_ADMIN comme le principal,
//   donc exactement les mêmes droits partout ailleurs dans l'app (annonces,
//   employés, sondages, etc.). La seule différence est la gestion de
//   l'équipe d'administration elle-même.
//
// Un co-admin DÉSACTIVÉ garde son rôle ORG_ADMIN (il peut être réactivé à
// tout moment) et occupe donc toujours une place : pour libérer la place,
// le principal le RETIRE (il redevient employé) ou le REMPLACE.
// ------------------------------------------------------------

export const MAX_CO_ADMINS = 2;

/**
 * Renvoie l'id de l'admin principal. Pour une organisation créée avant
 * cette fonctionnalité (primaryAdminId encore null), l'ORG_ADMIN le plus
 * ancien est désigné et enregistré une fois pour toutes.
 */
export async function getPrimaryAdminId(organizationId: string): Promise<string | null> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { primaryAdminId: true },
  });
  if (organization?.primaryAdminId) return organization.primaryAdminId;

  const oldestAdmin = await prisma.user.findFirst({
    where: { organizationId, role: "ORG_ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!oldestAdmin) return null;

  // updateMany + condition "encore null" : si deux requêtes arrivent en même
  // temps, une seule écrit, et on relit la valeur qui a gagné.
  await prisma.organization.updateMany({
    where: { id: organizationId, primaryAdminId: null },
    data: { primaryAdminId: oldestAdmin.id },
  });
  const updated = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { primaryAdminId: true },
  });
  return updated?.primaryAdminId ?? oldestAdmin.id;
}

export async function isPrimaryAdmin(ctx: AuthContext): Promise<boolean> {
  if (ctx.role !== "ORG_ADMIN") return false;
  return (await getPrimaryAdminId(ctx.organizationId)) === ctx.userId;
}

/** Lève ForbiddenError si l'utilisateur n'est pas l'admin principal. */
export async function requirePrimaryAdmin(ctx: AuthContext): Promise<void> {
  if (!(await isPrimaryAdmin(ctx))) {
    throw new ForbiddenError("Réservé à l'administrateur principal");
  }
}

/** Nombre de co-admins (actifs OU désactivés) : chacun occupe une place. */
export async function countCoAdmins(organizationId: string, primaryAdminId: string | null) {
  return prisma.user.count({
    where: {
      organizationId,
      role: "ORG_ADMIN",
      ...(primaryAdminId ? { id: { not: primaryAdminId } } : {}),
    },
  });
}
