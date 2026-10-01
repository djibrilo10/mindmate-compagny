import type { TFunction } from "./translator";

/** 6 -> "6 mois" / "6 months" ; 24 -> "2 ans" / "2 years". */
export function formatDuration(t: TFunction, months: number) {
  return months % 12 === 0 ? t("duration.years", { count: months / 12 }) : t("duration.months", { count: months });
}
