import { NextResponse, after } from "next/server";
import { HOUR, clientIp, consume, tooManyRequests } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";
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
  if (!(await consume(`forgot:ip:${clientIp(request.headers)}`, 10, HOUR))) return tooManyRequests();
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "errors.invalidData" },
      { status: 400 }
    );
  }

  const genericOk = NextResponse.json({ ok: true });
  const baseUrl = appBaseUrl(request);

  // La réponse part TOUT DE SUITE, la recherche du compte et l'envoi du
  // courriel se font après (AUDIT.md 7.49) : le temps de réponse est le même
  // que le compte existe ou non, impossible de deviner les comptes.
  after(async () => {
    try {
      await sendResetIfAccountExists(parsed.data.organizationSlug, parsed.data.email, baseUrl);
    } catch (error) {
      console.error("[forgot-password]", error);
    }
  });
  return genericOk;
}

async function sendResetIfAccountExists(organizationSlug: string, email: string, baseUrl: string) {
  {
    // (bloc conservé tel quel depuis l'ancienne version synchrone)
    const organization = await prisma.organization.findUnique({
      where: { slug: organizationSlug.toLowerCase() },
      select: { id: true, name: true, status: true, defaultLocale: true },
    });
    if (!organization) return;

    const user = await prisma.user.findUnique({
      where: { organizationId_email: { organizationId: organization.id, email } },
      select: { id: true, email: true, firstName: true, status: true, role: true, locale: true },
    });
    if (!user || !user.email || user.status !== "ACTIVE") return;
    // Organisation suspendue : la personne ne pourrait pas se connecter de
    // toute façon (sauf le propriétaire de la plateforme).
    if (organization.status === "SUSPENDED" && user.role !== "SUPER_ADMIN") return;
    if (await tooManyEmailRequests(user.id)) return;

    const { rawToken } = await createPasswordResetToken({ userId: user.id, ttlMs: EMAIL_RESET_TTL_MS });
    const url = resetPasswordUrl(baseUrl, rawToken);

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
  }
}
