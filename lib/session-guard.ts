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
 * Lève une erreur si l'utilisateur n'est pas connecté, ou si son
 * organisation a été suspendue depuis la dernière connexion (le token JWT
 * reste valide jusqu'à 8h — c'est cette vérification qui coupe l'accès en
 * temps réel, pas l'expiration du token).
 * -> organizationId vient TOUJOURS du token signé, jamais du body/query envoyé par le client.
 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new UnauthorizedError("Non authentifié");
  }
  const user = session.user as any;

  // Le SUPER_ADMIN (vous) gère TOUTES les organisations clientes depuis
  // /platform — son accès ne doit jamais dépendre du statut de SA PROPRE
  // organisation interne (voir AUDIT.md 7.20).
  if (user.role !== "SUPER_ADMIN") {
    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { status: true },
    });
    if (organization?.status === "SUSPENDED") {
      throw new OrganizationSuspendedError("Organisation suspendue");
    }
  }

  return {
    userId: user.id,
    organizationId: user.organizationId,
    departmentId: user.departmentId ?? null,
    role: user.role,
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
