import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { requireAuth, requireRole, handleAuthError, ForbiddenError } from "@/lib/session-guard";
import { ADMIN_RESET_TTL_MS, appBaseUrl, createPasswordResetToken, resetPasswordUrl } from "@/lib/password-reset";

// ------------------------------------------------------------
// POST /api/users/[id]/reset-link (AUDIT.md 7.35)
// Un admin génère un lien de réinitialisation (24 h, usage unique) pour un
// employé qui n'a pas accès à son courriel, et le lui transmet (texto, en
// personne…). L'admin ne voit JAMAIS le mot de passe : c'est l'employé qui
// choisit le nouveau en ouvrant le lien.
// Mêmes règles que la désactivation (PATCH /api/users/[id]) : réservé aux
// admins, impossible sur son propre compte ou sur un compte administrateur.
// ------------------------------------------------------------

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN", "SUPER_ADMIN"]);

    const { id } = await params;
    if (id === ctx.userId) {
      throw new ForbiddenError("Impossible de générer un lien pour son propre compte");
    }

    // where combine id ET organizationId : impossible de viser un compte
    // d'une autre entreprise. ...VISIBLE_USER : le compte propriétaire
    // répond « introuvable » (AUDIT.md 7.24).
    const target = await prisma.user.findFirst({
      where: { id, organizationId: ctx.organizationId, ...VISIBLE_USER },
      select: { id: true, role: true, status: true },
    });
    if (!target) {
      return Response.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }
    if (target.role === "ORG_ADMIN" || target.role === "SUPER_ADMIN") {
      throw new ForbiddenError("Les comptes administrateurs utilisent « Mot de passe oublié » sur la page de connexion");
    }
    if (target.status !== "ACTIVE") {
      return Response.json({ error: "Ce compte est désactivé. Réactive-le d'abord." }, { status: 400 });
    }

    const { rawToken, expiresAt } = await createPasswordResetToken({
      userId: target.id,
      ttlMs: ADMIN_RESET_TTL_MS,
      createdById: ctx.userId,
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "USER_PASSWORD_RESET_LINK_CREATED",
        targetId: target.id,
      },
    });

    return Response.json({ url: resetPasswordUrl(appBaseUrl(request), rawToken), expiresAt: expiresAt.toISOString() });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
