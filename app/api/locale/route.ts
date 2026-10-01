import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

// POST /api/locale { locale: "fr" | "en" } -> bouton FR/EN (voir AUDIT.md 7.29).
// Route PUBLIQUE (hors matcher du middleware) : utilisable aussi sur les pages
// de connexion/inscription. Pose le cookie de l'appareil et, si la personne
// est connectée, enregistre le choix sur son compte (suivi sur tous ses
// appareils). Le SUPER_ADMIN n'a pas de préférence (espace /platform en français).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const locale = body?.locale;
  if (!isLocale(locale)) {
    return Response.json({ error: "Langue invalide" }, { status: 400 });
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (userId) {
      await prisma.user.updateMany({
        where: { id: userId, role: { not: "SUPER_ADMIN" } },
        data: { locale },
      });
    }
  } catch (error) {
    // Le cookie suffit pour cet appareil : on ne bloque pas le changement.
    console.error("[locale] enregistrement sur le compte impossible", error);
  }

  return Response.json({ ok: true, locale });
}
