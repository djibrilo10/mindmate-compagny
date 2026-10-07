import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/session-guard";
import { VISIBLE_USER } from "@/lib/visibility";
import { managedByWhere } from "@/lib/departments";

// ------------------------------------------------------------
// Horaires de travail (voir AUDIT.md 7.36).
//
// Un quart = une personne + une date ("2026-10-12") + heure de début et de
// fin en MINUTES depuis minuit (heure locale de l'entreprise, sans fuseau :
// « 9 h à 17 h » reste « 9 h à 17 h » peu importe où est le serveur).
// Fin <= début  =>  le quart se termine le lendemain (ex. 22 h -> 6 h).
//
// Qui planifie : l'admin (toute l'entreprise) et chaque responsable (les
// membres des départements qu'il gère). Les employés ne voient que LEURS
// quarts PUBLIÉS : un quart reste un brouillon invisible jusqu'à ce que le
// gérant clique « Publier la semaine ».
// ------------------------------------------------------------

export * from "./schedule-time";
import { addDays, shiftDuration } from "./schedule-time";

export function isManagementRole(role: string) {
  return role === "ORG_ADMIN" || role === "MANAGER";
}

/**
 * Personnes dont cette personne peut faire l'horaire :
 * admin = toute l'entreprise ; responsable = membres de ses départements ;
 * employé = personne (null). Comptes actifs seulement.
 */
export function schedulableUsersWhere(ctx: AuthContext): Prisma.UserWhereInput | null {
  const base: Prisma.UserWhereInput = { organizationId: ctx.organizationId, status: "ACTIVE", ...VISIBLE_USER };
  if (ctx.role === "ORG_ADMIN") return base;
  if (ctx.role === "MANAGER") return { ...base, ...managedByWhere(ctx.userId) };
  return null;
}

export async function canScheduleUser(ctx: AuthContext, userId: string): Promise<boolean> {
  const where = schedulableUsersWhere(ctx);
  if (!where) return false;
  const found = await prisma.user.findFirst({ where: { ...where, id: userId }, select: { id: true } });
  return Boolean(found);
}

/**
 * Le quart proposé chevauche-t-il un autre quart de la même personne ?
 * (on regarde la veille, le jour même et le lendemain, à cause des quarts
 * de nuit). excludeId : le quart en cours de modification.
 */
export async function findOverlappingShift(params: {
  organizationId: string;
  userId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  excludeId?: string;
}) {
  const candidates = await prisma.shift.findMany({
    where: {
      organizationId: params.organizationId,
      userId: params.userId,
      date: { gte: addDays(params.date, -1), lte: addDays(params.date, 1) },
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    },
    select: { id: true, date: true, startMinute: true, endMinute: true },
  });
  const origin = new Date(`${params.date}T00:00:00Z`).getTime();
  const toRange = (date: string, start: number, end: number) => {
    const offset = Math.round((new Date(`${date}T00:00:00Z`).getTime() - origin) / 60000);
    return [offset + start, offset + start + shiftDuration(start, end)] as const;
  };
  const [a0, a1] = toRange(params.date, params.startMinute, params.endMinute);
  return candidates.find((c) => {
    const [b0, b1] = toRange(c.date, c.startMinute, c.endMinute);
    return a0 < b1 && b0 < a1;
  }) ?? null;
}
