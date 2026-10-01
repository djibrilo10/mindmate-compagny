import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { createTranslator } from "./translator";
import { dictionaries } from "./dictionaries";

// ------------------------------------------------------------
// Langue de la requête en cours (pages serveur ET routes API), dans cet ordre :
// 1. connecté : la langue choisie par la personne (User.locale) ;
// 2. sinon, la langue choisie sur cet appareil (cookie mm_locale, posé par le
//    bouton FR/EN, par exemple sur la page de connexion) ;
// 3. connecté sans choix : la langue par défaut de l'entreprise
//    (Organization.defaultLocale, réglée par l'admin dans Paramètres) ;
// 4. pas connecté : la langue du navigateur (Accept-Language), sinon français.
// Le propriétaire de la plateforme (SUPER_ADMIN) reste toujours en français.
// cache() : calculé une seule fois par requête même si appelé partout.
// ------------------------------------------------------------

export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const code = part.split(";")[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return null;
}

export const getLocale = cache(async (): Promise<Locale> => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const chosenOnDevice = isLocale(cookieLocale) ? cookieLocale : null;

  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, locale: true, organization: { select: { defaultLocale: true } } },
      });
      if (user) {
        if (user.role === "SUPER_ADMIN") return "fr";
        if (isLocale(user.locale)) return user.locale;
        if (chosenOnDevice) return chosenOnDevice;
        if (isLocale(user.organization.defaultLocale)) return user.organization.defaultLocale;
      }
    }
  } catch {
    // Session illisible : on retombe sur le cookie / le navigateur.
  }

  if (chosenOnDevice) return chosenOnDevice;
  const headerStore = await headers();
  return localeFromAcceptLanguage(headerStore.get("accept-language")) ?? DEFAULT_LOCALE;
});

/** Traducteur de la requête en cours : `const { t, formatDate } = await getI18n();` */
export const getI18n = cache(async () => {
  const locale = await getLocale();
  return createTranslator(locale, dictionaries[locale]);
});
