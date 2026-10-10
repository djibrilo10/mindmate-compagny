import { prisma } from "@/lib/prisma";

// ------------------------------------------------------------
// Limiteur anti-abus (AUDIT.md 7.49), stocké en base (table rate_limit_hits)
// pour fonctionner sur Vercel, où chaque requête peut tomber sur une instance
// différente (un compteur en mémoire ne suffirait pas).
//
//   if (!(await consume(`register:ip:${ip}`, 5, HOUR))) -> 429
//
// En cas de panne de la base, on laisse passer (le limiteur ne doit jamais
// bloquer de vrais utilisateurs) — l'erreur est notée dans les journaux.
// ------------------------------------------------------------

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined;

/** Adresse IP du client (Vercel renseigne x-forwarded-for / x-real-ip). */
export function clientIp(headers: HeaderSource): string {
  const get = (name: string): string | undefined => {
    if (!headers) return undefined;
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const v = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v;
  };
  const forwarded = get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || get("x-real-ip") || "unknown").slice(0, 64);
}

/** Nombre de tentatives enregistrées pour `key` sur la fenêtre. */
export async function countHits(key: string, windowMs: number) {
  try {
    return await prisma.rateLimitHit.count({ where: { key, createdAt: { gte: new Date(Date.now() - windowMs) } } });
  } catch (error) {
    console.error("[rate-limit] lecture impossible", error);
    return 0;
  }
}

/** Enregistre une tentative (et purge de temps en temps les vieilles lignes). */
export async function recordHit(key: string) {
  try {
    await prisma.rateLimitHit.create({ data: { key } });
    if (Math.random() < 0.02) {
      await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * HOUR) } } });
    }
  } catch (error) {
    console.error("[rate-limit] écriture impossible", error);
  }
}

/** Efface les tentatives d'une clé (ex. connexion réussie). */
export async function clearHits(key: string) {
  try {
    await prisma.rateLimitHit.deleteMany({ where: { key } });
  } catch (error) {
    console.error("[rate-limit] effacement impossible", error);
  }
}

/** true = autorisé (et la tentative est comptée) ; false = limite atteinte. */
export async function consume(key: string, limit: number, windowMs: number) {
  if ((await countHits(key, windowMs)) >= limit) return false;
  await recordHit(key);
  return true;
}

/** Réponse 429 standard (clé de traduction, lue par tx() côté écran). */
export function tooManyRequests() {
  return Response.json({ error: "errors.tooManyRequests" }, { status: 429, headers: { "Retry-After": "900" } });
}
