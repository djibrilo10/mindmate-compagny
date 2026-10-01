import { intlLocale, type Locale } from "./config";
import type { Messages } from "./messages/fr";

// ------------------------------------------------------------
// Traduction pure (aucune dépendance serveur ni React) : utilisée par
// lib/i18n/server.ts (pages et routes serveur) ET par I18nProvider (client).
//
//   t("nav.dashboard")                       -> "Tableau de bord"
//   t("dashboard.welcome", { name: "Ana" })  -> remplace {name}
//   t("surveys.pending", { count: 3 })       -> choisit one/other selon la langue
//   tx(texte)  -> traduit si c'est une clé connue (ex. message d'erreur
//                 renvoyé par une route ou par zod), sinon le renvoie tel quel.
// ------------------------------------------------------------

type Plural = { one: string; other: string };
type Leaf = string | Plural;

// Toutes les clés "a.b.c" du dictionnaire (un objet {one, other} = une seule clé).
export type MessageKey<T = Messages> = {
  [K in keyof T & string]: T[K] extends Leaf ? K : `${K}.${MessageKey<T[K]>}`;
}[keyof T & string];

export type Vars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: Vars) => string;

function lookup(messages: unknown, key: string): Leaf | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && "one" in node && "other" in node) return node as Plural;
  return undefined;
}

function interpolate(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function createTranslator(locale: Locale, messages: Messages) {
  const plural = new Intl.PluralRules(intlLocale(locale));

  function resolve(key: string, vars?: Vars): string | undefined {
    const value = lookup(messages, key);
    if (value === undefined) return undefined;
    if (typeof value === "string") return interpolate(value, vars);
    const count = typeof vars?.count === "number" ? vars.count : 0;
    return interpolate(plural.select(count) === "one" ? value.one : value.other, vars);
  }

  const t: TFunction = (key, vars) => resolve(key, vars) ?? key;
  const tx = (text: string | null | undefined, vars?: Vars): string => {
    if (!text) return "";
    return resolve(text, vars) ?? text;
  };

  const formatDate = (date: Date | string, options?: Intl.DateTimeFormatOptions) =>
    new Date(date).toLocaleDateString(intlLocale(locale), options ?? { year: "numeric", month: "long", day: "numeric" });
  const formatDateTime = (date: Date | string, options?: Intl.DateTimeFormatOptions) =>
    new Date(date).toLocaleString(intlLocale(locale), options ?? { dateStyle: "medium", timeStyle: "short" });
  const formatNumber = (value: number, options?: Intl.NumberFormatOptions) =>
    value.toLocaleString(intlLocale(locale), options);

  return { locale, t, tx, formatDate, formatDateTime, formatNumber };
}

export type Translator = ReturnType<typeof createTranslator>;
