import type { Prisma } from "@prisma/client";
import type { AuthContext } from "@/lib/session-guard";
import { managedDepartmentIds } from "@/lib/departments";

// ------------------------------------------------------------
// Horaires téléversés en fichier (Excel, PDF, Word, image) — AUDIT.md 7.39.
// Pour les gérants qui font déjà leur horaire dans Excel ou sur papier : ils
// téléversent le fichier de la semaine, choisissent qui peut le voir (tous
// les employés ou un seul département), et les employés concernés le
// consultent dans « Horaires » (avec notification).
// Fichiers stockés dans Postgres comme les Documents (pas de stockage
// externe), donc même limite de taille (requête Vercel <= 4,5 Mo).
// ------------------------------------------------------------

export * from "./schedule-file-types";

/**
 * Fichiers d'horaire que cette personne peut voir :
 * - admin : tous ceux de l'entreprise ;
 * - responsable : ceux destinés à tout le monde ou à un département qu'il gère,
 *   plus celui de son propre département ;
 * - employé : ceux destinés à tout le monde ou à SON département.
 */
export async function visibleScheduleFilesWhere(ctx: AuthContext): Promise<Prisma.ScheduleFileWhereInput> {
  const base = { organizationId: ctx.organizationId };
  if (ctx.role === "ORG_ADMIN" || ctx.role === "SUPER_ADMIN") return base;
  const departmentIds = ctx.role === "MANAGER" ? await managedDepartmentIds(ctx.userId) : [];
  if (ctx.departmentId) departmentIds.push(ctx.departmentId);
  return { ...base, OR: [{ departmentId: null }, { departmentId: { in: departmentIds } }] };
}

/**
 * Peut-il téléverser / retirer un fichier pour ce département ?
 * departmentId null = « tous les employés » : réservé à l'admin.
 */
export async function canManageScheduleFileFor(ctx: AuthContext, departmentId: string | null): Promise<boolean> {
  if (ctx.role === "ORG_ADMIN") return true;
  if (ctx.role !== "MANAGER" || !departmentId) return false;
  return (await managedDepartmentIds(ctx.userId)).includes(departmentId);
}
