import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/session-guard";
import { VISIBLE_USER } from "@/lib/visibility";

// ------------------------------------------------------------
// Départements et responsables (voir AUDIT.md 7.34).
// - L'admin PRINCIPAL crée les départements (nom + couleur du badge) et
//   nomme leurs responsables.
// - Les employés choisissent leur département à l'inscription (ou une seule
//   fois à la connexion pour les comptes existants) ; ensuite seuls les
//   admins peuvent le changer.
// - Responsable = rôle MANAGER, recalculé à chaque nomination/retrait
//   (syncManagerRole) : MANAGER s'il gère ≥ 1 département, sinon EMPLOYEE.
//   Ses droits portent UNIQUEMENT sur les membres des départements qu'il gère.
// ------------------------------------------------------------

export const DEPARTMENT_COLORS = ["#1F8A6E", "#E0A43A", "#3F6FB0", "#C9542C", "#8B6BC9", "#2A9FB0", "#5B6478", "#B0487A"] as const;
export const MAX_DEPARTMENTS = 60;

/** Filtre Prisma : utilisateurs membres d'un département géré par `managerId`. */
export function managedByWhere(managerId: string): Prisma.UserWhereInput {
  return { department: { managers: { some: { userId: managerId } } } };
}

/**
 * Personnes dont cette personne peut voir la fiche (page Employés, export) :
 * admin = toute l'entreprise ; responsable = membres de ses départements ;
 * employé = personne (null).
 */
export function teamMembersWhere(ctx: AuthContext): Prisma.UserWhereInput | null {
  const base: Prisma.UserWhereInput = { organizationId: ctx.organizationId, ...VISIBLE_USER };
  if (ctx.role === "ORG_ADMIN") return base;
  if (ctx.role === "MANAGER") return { ...base, ...managedByWhere(ctx.userId) };
  return null;
}

export async function managedDepartmentIds(userId: string) {
  const rows = await prisma.departmentManager.findMany({ where: { userId }, select: { departmentId: true } });
  return rows.map((r) => r.departmentId);
}

/** Rôle recalculé après une nomination ou un retrait (jamais pour un admin). */
export async function syncManagerRole(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || (user.role !== "EMPLOYEE" && user.role !== "MANAGER")) return;
  const count = await prisma.departmentManager.count({ where: { userId } });
  const role = count > 0 ? "MANAGER" : "EMPLOYEE";
  if (role !== user.role) await prisma.user.update({ where: { id: userId }, data: { role } });
}

/** Responsables (actifs) d'un département, pour les notifications. */
export async function departmentManagerIds(departmentId: string | null | undefined) {
  if (!departmentId) return [];
  const rows = await prisma.departmentManager.findMany({
    where: { departmentId, user: { status: "ACTIVE" } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

export async function getDepartments(organizationId: string) {
  return prisma.department.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
}

/**
 * La personne doit-elle choisir son département (fenêtre unique) ?
 * Oui si : employé ou responsable, jamais confirmé, et l'entreprise a au
 * moins 2 départements (avec un seul, il n'y a rien à choisir).
 */
export async function needsDepartmentChoice(user: { role: string; departmentConfirmedAt: Date | null; organizationId: string }) {
  if (user.departmentConfirmedAt) return false;
  if (user.role !== "EMPLOYEE" && user.role !== "MANAGER") return false;
  const count = await prisma.department.count({ where: { organizationId: user.organizationId } });
  return count >= 2;
}
