"use client";

import { intlLocale } from "@/lib/i18n/config";
import { useI18n } from "@/components/i18n/I18nProvider";

// Affiche une date/heure dans le fuseau du NAVIGATEUR de la personne qui
// regarde (le serveur Vercel tourne en UTC : formater côté serveur décalerait
// l'heure d'un rendez-vous). Voir AUDIT.md 7.27.
export function LocalDateTime({ iso, withTime = true }: { iso: string; withTime?: boolean }) {
  const { locale } = useI18n();
  const date = new Date(iso);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {date.toLocaleString(intlLocale(locale), {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      })}
    </time>
  );
}
