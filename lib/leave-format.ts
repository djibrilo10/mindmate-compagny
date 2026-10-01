import type { MessageKey, Translator, TFunction } from "@/lib/i18n/translator";

// Affichage des congés (client ET serveur, aucune dépendance base de données).
// Voir AUDIT.md 7.30.

// UNPAID (ancien « Sans solde ») est retiré : une vieille demande de ce type s'affiche « Autre » (AUDIT.md 7.33).
const DEFAULT_CODES = ["VACATION", "SICK", "PERSONAL", "OTHER"];

/** Nom d'un type : nom personnalisé par l'admin, sinon nom traduit du type par défaut. */
export function leaveTypeLabel(t: TFunction, type: { code: string | null; name: string | null } | null | undefined) {
  if (type?.name?.trim()) return type.name.trim();
  const code = type?.code && DEFAULT_CODES.includes(type.code) ? type.code : "OTHER";
  return t(`leave.types.${code}` as MessageKey);
}

/** Dates (UTC) d'une demande : « 14 oct. 2026 (matin) » ou « 14 oct. → 18 oct. 2026 ». */
export function formatLeaveDates(
  i18n: Pick<Translator, "t" | "formatDate">,
  start: Date | string,
  end: Date | string,
  halfDay: string | null
) {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
  const s = i18n.formatDate(start, opts);
  const e = i18n.formatDate(end, opts);
  if (s === e) {
    if (halfDay === "AM") return `${s} (${i18n.t("leave.morning")})`;
    if (halfDay === "PM") return `${s} (${i18n.t("leave.afternoon")})`;
    return s;
  }
  return `${s} → ${e}`;
}

/** 2.5 -> "2,5 jours" / "2.5 days". */
export function formatDays(i18n: Pick<Translator, "t" | "formatNumber">, days: number) {
  return i18n.t("leave.days", { count: days, n: days }).replace(String(days), i18n.formatNumber(days));
}

// Pastilles de statut (importables par les pages serveur ET les composants client).
export const LEAVE_STATUS_STYLES: Record<"PENDING" | "APPROVED" | "REJECTED" | "CANCELLED", string> = {
  PENDING: "bg-[#FDF3E3] text-[#8A6A1C]",
  APPROVED: "bg-[#E7F3EF] text-[#2F6F5E]",
  REJECTED: "bg-[#FDECEC] text-[#8A3B3B]",
  CANCELLED: "bg-[#F3F5F8] text-[#5B6478]",
};

/** Heure "13:30" dans la langue (« 13 h 30 » / « 1:30 p.m. »). */
export function formatTime(i18n: Pick<Translator, "locale">, time: string) {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(i18n.locale === "en" ? "en-CA" : "fr-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Dates d'un congé programmé, avec les heures facultatives (AUDIT.md 7.31). */
export function formatCompanyLeaveDates(
  i18n: Pick<Translator, "t" | "formatDate" | "locale">,
  leave: { startDate: Date | string; endDate: Date | string; startTime: string | null; endTime: string | null }
) {
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
  const s = i18n.formatDate(leave.startDate, opts);
  const e = i18n.formatDate(leave.endDate, opts);
  const from = leave.startTime ? ` ${i18n.t("leave.company.fromTime", { time: formatTime(i18n, leave.startTime) })}` : "";
  const until = leave.endTime ? ` ${i18n.t("leave.company.untilTime", { time: formatTime(i18n, leave.endTime) })}` : "";
  if (s === e) return `${s}${from}${until}`;
  return `${s}${from} → ${e}${until}`;
}
