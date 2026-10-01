import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { requirePrimaryAdmin } from "@/lib/admins";
import { privacySettingsSchema } from "@/lib/privacy";

// PATCH /api/organization/privacy -> réglages de confidentialité (Loi 25,
// AUDIT.md 7.28) : durée de conservation + responsable de la protection des
// renseignements personnels. Admin PRINCIPAL seulement (les co-admins voient
// les réglages dans Paramètres mais ne peuvent pas les changer).
export async function PATCH(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    await requirePrimaryAdmin(ctx);

    const body = await request.json().catch(() => null);
    const parsed = privacySettingsSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "Données invalides" }, { status: 400 });
    }
    const { dataRetentionMonths, privacyOfficerName, privacyOfficerEmail } = parsed.data;

    const before = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { dataRetentionMonths: true },
    });
    await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: {
        dataRetentionMonths,
        privacyOfficerName: privacyOfficerName || null,
        privacyOfficerEmail: privacyOfficerEmail || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ORGANIZATION_PRIVACY_UPDATED",
        metadata: { months: dataRetentionMonths, previousMonths: before?.dataRetentionMonths ?? null },
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
