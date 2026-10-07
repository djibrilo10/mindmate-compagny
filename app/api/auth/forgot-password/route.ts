import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { getI18n } from "@/lib/i18n/server";
import { sendEmail } from "@/lib/email";
import { buildPasswordResetEmail } from "@/lib/password-reset-email";
import {
  EMAIL_RESET_TTL_MS,
  appBaseUrl,
  createPasswordResetToken,
  resetPasswordUrl,
  tooManyEmailRequests,
} from "@/lib/password-reset";

// ------------------------------------------------------------
// POST /api/auth/forgot-password (public, AUDIT.md 7.35)
// { organizationSlug, email } -> envoie un lien de réinitialisation (1 h).
//
// La réponse est TOUJOURS la même (« si un compte existe, un courriel a été
// envoyé ») : on ne révèle jamais si l'entreprise ou l'adresse existent.
// ------------------------------------------------------------

export async function POST(request: Request) {
  const { t } = await getI18n();
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "errors.invalidData" },
      { status: 400 }
    );
  }

  const genericOk = NextResponse.json({ ok: true });

  try {
    const organization = await prisma.organization.findUnique({
      where: { slug: parsed.data.organizationSlug.toLowerCase() },
      select: { id: true, name: true, status: true, defaultLocale: true },
    });
    if (!organization) return genericOk;

    const user = await prisma.user.findUnique({
      where: { organizationId_email: { organizationId: organization.id, email: parsed.data.email } },
      select: { id: true, email: true, firstName: true, status: true, role: true, locale: true },
    });
    if (!user || !user.email || user.status !== "ACTIVE") return genericOk;
    // Organisation suspendue : la personne ne pourrait pas se connecter de
    // toute façon (sauf le propriétaire de la plateforme).
    if (organization.status === "SUSPENDED" && user.role !== "SUPER_ADMIN") return genericOk;
    if (await tooManyEmailRequests(user.id)) return genericOk;

    const { rawToken } = await createPasswordResetToken({ userId: user.id, ttlMs: EMAIL_RESET_TTL_MS });
    const url = resetPasswordUrl(appBaseUrl(request), rawToken);

    await sendEmail(
      buildPasswordResetEmail({
        to: user.email,
        firstName: user.firstName,
        organizationName: organization.name,
        url,
        locale: user.locale,
        fallbackLocale: organization.defaultLocale,
      })
    );

    return genericOk;
  } catch (error) {
    console.error("[forgot-password]", error);
    return NextResponse.json({ error: t("errors.serverError") }, { status: 500 });
  }
}
