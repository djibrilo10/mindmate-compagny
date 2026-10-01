// ------------------------------------------------------------
// Langues de l'application (FR/EN, voir AUDIT.md 7.29).
// Fichier sans dépendance serveur : importable côté client.
// ------------------------------------------------------------

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/** Cookie posé quand la personne CHOISIT une langue (bouton FR/EN). */
export const LOCALE_COOKIE = "mm_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Locale Intl pour les dates et les nombres (Canada). */
export function intlLocale(locale: Locale): string {
  return locale === "en" ? "en-CA" : "fr-CA";
}

export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English" };
