import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

// ------------------------------------------------------------
// À utiliser au TOUT DÉBUT de chaque route API protégée.
// Ce fichier centralise "qui a le droit de faire quoi" pour éviter
// de dupliquer (et donc d'oublier) la logique de sécurité partout.
// ------------------------------------------------------------

export type AuthContext = {
  userId: string;
  organizationId: string;
  departmentId: string | null;
  role: Role;
};

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}
// Organisation suspendue par le SUPER_ADMIN depuis /platform (voir AUDIT.md
// 7.20), typiquement pour non-paiement — distincte de UnauthorizedError
// (pas de session) pour permettre d'afficher un message clair (page
// /suspended) plutôt qu'un simple renvoi vers /login.
export class OrganizationSuspendedError extends Error {}

/**
 * Récupère le contexte d'authentification depuis la session serveur.
 * Lève une erreur si l'utilisateur n'est pas connecté, si son compte a été
 * désactivé, ou si son organisation a été suspendue depuis la dernière connexion (le token JWT
 * reste valide jusqu'à 8h — c'est cette vérification qui coupe l'accès en
 * temps réel, pas l'expiration du token).
 * -> organizationId vient TOUJOURS du token signé, jamais du body/query envoyé par le client.
 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new UnauthorizedError("Non authentifié");
  }
  const sessionUser = session.user as any;
  if (!sessionUser.id) {
    throw new UnauthorizedError("Non authentifié");
  }

  // Rôle et statut relus EN BASE à chaque requête, pas depuis le token JWT
  // (valide 8h) : quand l'admin principal désactive, retire ou promeut un
  // co-admin (voir AUDIT.md 7.22), l'effet doit être immédiat, sans attendre
  // que la personne se déconnecte. Même raisonnement que pour la suspension
  // d'organisation ci-dessous. organizationId, lui, ne change jamais.
  const dbUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      role: true,
      status: true,
      organizationId: true,
      departmentId: true,
      organization: { select: { status: true } },
    },
  });
  if (!dbUser || dbUser.status !== "ACTIVE" || dbUser.organizationId !== sessionUser.organizationId) {
    throw new UnauthorizedError("Compte désactivé ou introuvable");
  }

  // Le SUPER_ADMIN (vous) gère TOUTES les organisations clientes depuis
  // /platform — son accès ne doit jamais dépendre du statut de SA PROPRE
  // organisation interne (voir AUDIT.md 7.20).
  if (dbUser.role !== "SUPER_ADMIN" && dbUser.organization.status === "SUSPENDED") {
    throw new OrganizationSuspendedError("Organisation suspendue");
  }

  return {
    userId: sessionUser.id,
    organizationId: dbUser.organizationId,
    departmentId: dbUser.departmentId ?? null,
    role: dbUser.role,
  };
}

/**
 * Vérifie que l'utilisateur a l'un des rôles autorisés.
 * Exemple : requireRole(ctx, ["ORG_ADMIN", "MANAGER"])
 */
export function requireRole(ctx: AuthContext, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(ctx.role)) {
    throw new ForbiddenError("Accès refusé pour ce rôle");
  }
}

/**
 * Convertit les erreurs d'auth en réponses HTTP correctes.
 * À utiliser dans un try/catch en haut de chaque handler de route.
 */
export function handleAuthError(error: unknown): Response | null {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof OrganizationSuspendedError) {
    return Response.json(
      { error: "Cette organisation est suspendue. Contactez votre administrateur." },
      { status: 403 }
    );
  }
  if (error instanceof ForbiddenError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  return null; // pas une erreur d'auth, à gérer ailleurs
}
