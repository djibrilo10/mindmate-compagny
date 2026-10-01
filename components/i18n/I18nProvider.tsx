"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages/fr";
import { createTranslator, type Translator } from "@/lib/i18n/translator";

// Fournit la langue et le dictionnaire aux composants client (voir
// AUDIT.md 7.29). Monté une fois dans app/layout.tsx.
const I18nContext = createContext<Translator | null>(null);

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => createTranslator(locale, messages), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `const { t, locale, formatDate } = useI18n();` dans un composant client. */
export function useI18n(): Translator {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n() doit être utilisé sous <I18nProvider>");
  return ctx;
}
