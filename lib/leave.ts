import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/session-guard";
import { VISIBLE_USER } from "@/lib/visibility";

// ------------------------------------------------------------
// Congés et absences (voir AUDIT.md 7.30).
// - Types de congés propres à chaque entreprise (LeaveType), créés
//   automatiquement au premier besoin avec 5 types par défaut.
// - Soldes : daysPerYear du type + ajustements individuels de l'année
//   − jours APPROUVÉS (les demandes en attente sont affichées à part).
// - Jours décomptés : lundi à vendredi (les jours fériés ne sont pas
//   retirés automatiquement), 0,5 pour une demi-journée.
// - Une demande compte entièrement dans l'année de congés de son 1er jour.
// - Approbation : admins (tout), gérant (son département seulement, jamais
//   ses propres demandes).
// Dates : "AAAA-MM-JJ" stockées à minuit UTC (pas de décalage de fuseau).
// ------------------------------------------------------------

export const DEFAULT_LEAVE_TYPES = [
  { code: "VACATION", color: "#1F8A6E", daysPerYear: 10 },
  // Maladie ET obligations familiales : un seul total, comme aux normes du
  // travail du Québec (2 jours payés par année). Voir AUDIT.md 7.31.
  { code: "SICK", color: "#C9542C", daysPerYear: 2 },
  { code: "OTHER", color: "#2A9FB0", daysPerYear: null },
] as const;
export type DefaultLeaveCode = (typeof DEFAULT_LEAVE_TYPES)[number]["code"];

export const LEAVE_COLORS = ["#1F8A6E", "#E0A43A", "#3F6FB0", "#C9542C", "#8B6BC9", "#2A9FB0"] as const;
export const MAX_LEAVE_TYPES = 12;
export const MAX_REQUEST_DAYS = 366;

/** Crée les 5 types par défaut si l'entreprise n'en a encore aucun. */
export async function ensureLeaveTypes(organizationId: string) {
  const count = await prisma.leaveType.count({ where: { organizationId } });
  if (count > 0) return;
  await prisma.leaveType.createMany({
    data: DEFAULT_LEAVE_TYPES.map((t, i) => ({
      organizationId,
      code: t.code,
      color: t.color,
      daysPerYear: t.daysPerYear,
      position: i,
    })),
    skipDuplicates: true, // deux premières visites simultanées
  });
}

// Types RETIRÉS de l'application (jamais affichés ni proposés) : l'ancien type
// « Sans solde / Absence non payée » — l'app ne parle pas de paie, c'est à
// l'employeur de décider (demande de l'utilisateur, AUDIT.md 7.33). Les
// entreprises créées avant le gardent en base ; il est simplement ignoré.
export const RETIRED_LEAVE_CODES = ["UNPAID"];
export const NOT_RETIRED: Prisma.LeaveTypeWhereInput = {
  OR: [{ code: null }, { code: { notIn: RETIRED_LEAVE_CODES } }],
};

export async function getLeaveTypes(organizationId: string, { activeOnly = false } = {}) {
  await ensureLeaveTypes(organizationId);
  return prisma.leaveType.findMany({
    where: { organizationId, ...NOT_RETIRED, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

// ---------------- Dates ----------------

/** "2026-10-14" -> Date à minuit UTC, ou null si invalide. */
export function parseDay(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

export function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Jours ouvrables (lun.-ven.) entre deux dates incluses ; 0,5 pour une
 * demi-journée. `closedDays` : journées entières de congé programmé par
 * l'entreprise ("AAAA-MM-JJ"), jamais décomptées (AUDIT.md 7.31).
 */
export function countLeaveDays(start: Date, end: Date, halfDay: "AM" | "PM" | null, closedDays?: Set<string>) {
  const counts = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !closedDays?.has(dayKey(d));
  if (halfDay) return counts(start) ? 0.5 : 0;
  let days = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (counts(d)) days += 1;
  }
  return days;
}

// ---------------- Congés programmés par l'entreprise (7.31) ----------------

/** Congés programmés qui concernent une personne (toute l'entreprise ou son département). */
export function companyLeavesFor(organizationId: string, departmentId: string | null): Prisma.CompanyLeaveWhereInput {
  return {
    organizationId,
    OR: [{ departmentIds: { isEmpty: true } }, ...(departmentId ? [{ departmentIds: { has: departmentId } }] : [])],
  };
}

/** Journées ENTIÈRES couvertes par des congés programmés (une journée avec une heure de début/fin ne compte pas). */
export function fullClosedDays(
  leaves: { startDate: Date; endDate: Date; startTime: string | null; endTime: string | null }[],
  from?: Date,
  to?: Date
) {
  const days = new Set<string>();
  for (const l of leaves) {
    for (let d = new Date(l.startDate); d <= l.endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      if (from && d < from) continue;
      if (to && d > to) break;
      const isFirst = d.getTime() === l.startDate.getTime();
      const isLast = d.getTime() === l.endDate.getTime();
      if ((isFirst && l.startTime) || (isLast && l.endTime)) continue;
      days.add(dayKey(d));
    }
  }
  return days;
}

/** Journées fermées pour une personne sur une période. */
export async function closedDaysFor(organizationId: string, departmentId: string | null, from: Date, to: Date) {
  const leaves = await prisma.companyLeave.findMany({
    where: { AND: [companyLeavesFor(organizationId, departmentId), { startDate: { lte: to }, endDate: { gte: from } }] },
    select: { startDate: true, endDate: true, startTime: true, endTime: true },
  });
  return fullClosedDays(leaves, from, to);
}

/** Année de congés d'une date (ex. début en mai : 15 mars 2027 -> 2026). */
export function leaveYearOf(date: Date, startMonth: number) {
  const y = date.getUTCFullYear();
  return date.getUTCMonth() + 1 >= startMonth ? y : y - 1;
}

/** [début inclus, fin exclue) d'une année de congés. */
export function leaveYearRange(year: number, startMonth: number) {
  return {
    from: new Date(Date.UTC(year, startMonth - 1, 1)),
    to: new Date(Date.UTC(year + 1, startMonth - 1, 1)),
  };
}

// ---------------- Droits ----------------

export function isLeaveManager(ctx: AuthContext) {
  return ctx.role === "ORG_ADMIN" || ctx.role === "MANAGER";
}

/**
 * Demandes que cette personne peut voir/traiter en tant qu'approbateur :
 * admin = toute l'entreprise ; gérant = son département, sauf ses propres
 * demandes ; employé = aucune (null).
 */
export function approverScope(ctx: AuthContext): Prisma.AbsenceRequestWhereInput | null {
  if (ctx.role === "ORG_ADMIN") return { organizationId: ctx.organizationId };
  if (ctx.role === "MANAGER") {
    if (!ctx.departmentId) return null;
    return {
      organizationId: ctx.organizationId,
      userId: { not: ctx.userId },
      user: { departmentId: ctx.departmentId },
    };
  }
  return null;
}

/** Personnes visibles dans le calendrier d'équipe. */
export function calendarPeopleWhere(ctx: AuthContext): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { organizationId: ctx.organizationId, status: "ACTIVE", ...VISIBLE_USER };
  if (ctx.role === "ORG_ADMIN") return base;
  // Gérant et employé : leur département (ou seulement eux-mêmes s'ils n'en ont pas).
  return ctx.departmentId ? { ...base, departmentId: ctx.departmentId } : { ...base, id: ctx.userId };
}

// ---------------- Soldes ----------------

export type BalanceRow = {
  leaveTypeId: string;
  allowance: number | null; // null = pas de solde
  adjustments: number;
  used: number;
  pending: number;
  available: number | null;
};

/** Soldes de plusieurs personnes pour une année de congés : Map<userId, Map<leaveTypeId, BalanceRow>>. */
export async function getBalances(organizationId: string, userIds: string[], year: number, startMonth: number) {
  const types = await getLeaveTypes(organizationId);
  const { from, to } = leaveYearRange(year, startMonth);
  const [requests, adjustments] = await Promise.all([
    prisma.absenceRequest.findMany({
      where: {
        organizationId,
        userId: { in: userIds },
        leaveTypeId: { not: null },
        status: { in: ["APPROVED", "PENDING"] },
        startDate: { gte: from, lt: to },
      },
      select: { userId: true, leaveTypeId: true, status: true, days: true },
    }),
    prisma.leaveBalanceAdjustment.findMany({
      where: { organizationId, userId: { in: userIds }, year },
      select: { userId: true, leaveTypeId: true, days: true },
    }),
  ]);

  const result = new Map<string, Map<string, BalanceRow>>();
  for (const userId of userIds) {
    const rows = new Map<string, BalanceRow>();
    for (const type of types) {
      rows.set(type.id, {
        leaveTypeId: type.id,
        allowance: type.daysPerYear,
        adjustments: 0,
        used: 0,
        pending: 0,
        available: null,
      });
    }
    result.set(userId, rows);
  }
  for (const a of adjustments) {
    const row = result.get(a.userId)?.get(a.leaveTypeId);
    if (row) row.adjustments += a.days;
  }
  for (const r of requests) {
    const row = r.leaveTypeId ? result.get(r.userId)?.get(r.leaveTypeId) : undefined;
    if (!row) continue;
    if (r.status === "APPROVED") row.used += r.days ?? 0;
    else row.pending += r.days ?? 0;
  }
  for (const rows of result.values()) {
    for (const row of rows.values()) {
      row.available = row.allowance === null ? null : round(row.allowance + row.adjustments - row.used);
    }
  }
  return result;
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

/** Autres personnes du même département absentes (approuvé ou en attente) sur la période. */
export async function overlappingAbsences(
  organizationId: string,
  departmentId: string | null,
  excludeUserId: string,
  start: Date,
  end: Date
) {
  if (!departmentId) return [];
  return prisma.absenceRequest.findMany({
    where: {
      organizationId,
      userId: { not: excludeUserId },
      user: { departmentId },
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { status: true, user: { select: { firstName: true, lastName: true } } },
  });
}

/** "" ou null -> null (non décompté) ; nombre 0..366 par pas de 0,5 ; sinon undefined (invalide). */
export function parseDaysPerYear(value: unknown): number | null | undefined {
  if (value === null || value === "" || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 366 || Math.round(n * 2) !== n * 2) return undefined;
  return n;
}
