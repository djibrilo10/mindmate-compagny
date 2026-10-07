// ------------------------------------------------------------
// Horaires : calculs de dates et d'heures SANS dépendance serveur
// (importable dans les composants client). Voir lib/schedule.ts et
// AUDIT.md 7.36.
// ------------------------------------------------------------

export const DEFAULT_TIMEZONE = "America/Toronto";
const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_SHIFT_MINUTES = 15;
export const MAX_SHIFT_MINUTES = 16 * 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** "09:30" -> 570 ; null si invalide. */
export function parseTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m = TIME_RE.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 570 -> "09:30" (1440 -> "00:00"). */
export function formatMinutes(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Durée en minutes ; une fin <= début veut dire « le lendemain ». */
export function shiftDuration(startMinute: number, endMinute: number): number {
  return endMinute > startMinute ? endMinute - startMinute : endMinute + 1440 - startMinute;
}

export function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Lundi de la semaine qui contient cette date. */
export function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = dimanche
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Date du jour dans le fuseau de l'entreprise (Québec par défaut). */
export function todayInZone(timeZone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
