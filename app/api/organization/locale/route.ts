import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { isLocale } from "@/lib/i18n/config";
import { getI18n } from "@/lib/i18n/server";

// PATCH /api/organization/locale { defaultLocale } -> langue par défaut de
// l'entreprise (voir AUDIT.md 7.29) : utilisée pour tout compte qui n'a pas
// encore choisi sa propre langue. Réservé aux admins de l'organisation.
export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    const { t } = await getI18n();

    const body = await request.json().catch(() => null);
    const defaultLocale = body?.defaultLocale;
    if (!isLocale(defaultLocale)) {
      return Response.json({ error: t("errors.invalidLanguage") }, { status: 400 });
    }

    await prisma.organization.update({ where: { id: ctx.organizationId }, data: { defaultLocale } });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ORGANIZATION_LOCALE_UPDATED",
        metadata: { defaultLocale },
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
