import { createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";

// ------------------------------------------------------------
// « Mot de passe oublié » (voir AUDIT.md 7.35).
//
// Deux façons d'obtenir un lien de réinitialisation, même mécanisme :
//  - la personne le demande elle-même : lien envoyé par courriel, valide 1 h ;
//  - un admin le génère depuis la page Employés (pour quelqu'un qui n'a pas
//    accès à son courriel) : lien à copier et à transmettre, valide 24 h.
//
// Sécurité :
//  - jeton aléatoire de 32 octets ; seule son empreinte SHA-256 est stockée ;
//  - un seul lien actif à la fois par personne (créer un lien annule les autres) ;
//  - usage unique (usedAt) ;
//  - maximum 3 demandes par courriel par tranche de 15 minutes par compte.
// ------------------------------------------------------------

export const EMAIL_RESET_TTL_MS = 60 * 60 * 1000; // 1 h
export const ADMIN_RESET_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const EMAIL_REQUESTS_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_REQUESTS_MAX = 3;

export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Adresse publique de l'app (ex. https://www.mindmatecompagny.com). */
export function appBaseUrl(request: Request): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  // En production, jamais l'en-tête Host de la requête (il pourrait être
  // falsifié pour détourner les liens envoyés par courriel, AUDIT.md 7.49).
  if (process.env.NODE_ENV === "production") return "https://www.mindmatecompagny.com";
  return new URL(request.url).origin;
}

export function resetPasswordUrl(baseUrl: string, rawToken: string): string {
  return `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

/** Trop de demandes récentes par courriel pour ce compte ? */
export async function tooManyEmailRequests(userId: string): Promise<boolean> {
  const recent = await prisma.passwordResetToken.count({
    where: {
      userId,
      createdById: null,
      createdAt: { gt: new Date(Date.now() - EMAIL_REQUESTS_WINDOW_MS) },
    },
  });
  return recent >= EMAIL_REQUESTS_MAX;
}

/**
 * Crée un nouveau lien pour cette personne et annule ses liens encore actifs.
 * Retourne le jeton EN CLAIR (à mettre dans le lien, jamais en base).
 */
export async function createPasswordResetToken(params: {
  userId: string;
  ttlMs: number;
  createdById?: string | null;
}): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + params.ttlMs);
  const now = new Date();

  await prisma.$transaction([
    // Les anciens liens non utilisés deviennent inutilisables.
    prisma.passwordResetToken.updateMany({
      where: { userId: params.userId, usedAt: null },
      data: { usedAt: now },
    }),
    // Ménage : les lignes expirées depuis plus de 7 jours ne servent plus à rien.
    prisma.passwordResetToken.deleteMany({
      where: { userId: params.userId, expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: params.userId,
        tokenHash: hashResetToken(rawToken),
        expiresAt,
        createdById: params.createdById ?? null,
      },
    }),
  ]);

  return { rawToken, expiresAt };
}

/** Lien encore valide (non utilisé, non expiré, compte actif) ou null. */
export async function findValidResetToken(rawToken: string) {
  if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return null;
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(rawToken) },
    select: {
      id: true,
      userId: true,
      usedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          status: true,
          role: true,
          organizationId: true,
          organization: { select: { slug: true, status: true } },
        },
      },
    },
  });
  if (!token || token.usedAt || token.expiresAt.getTime() < Date.now()) return null;
  if (token.user.status !== "ACTIVE") return null;
  return token;
}
