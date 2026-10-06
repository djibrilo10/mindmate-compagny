import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { getI18n } from "@/lib/i18n/server";
import { findValidResetToken } from "@/lib/password-reset";

// ------------------------------------------------------------
// POST /api/auth/reset-password (public, AUDIT.md 7.35)
// { token, password, confirmPassword } -> remplace le mot de passe.
// Le lien est à usage unique : il est « consommé » dans la même transaction
// que le changement de mot de passe, et tous les autres liens de la personne
// sont annulés.
// ------------------------------------------------------------

export async function POST(request: Request) {
  const { t } = await getI18n();
  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "errors.invalidData" },
      { status: 400 }
    );
  }

  try {
    const token = await findValidResetToken(parsed.data.token);
    if (!token) {
      return NextResponse.json({ error: "validation.resetLinkInvalid" }, { status: 400 });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const now = new Date();

    const consumed = await prisma.$transaction(async (tx) => {
      // updateMany + usedAt: null : si le même lien est utilisé deux fois en
      // même temps, une seule des deux requêtes le consomme ; l'autre ne
      // change rien (pas de mot de passe modifié).
      const claim = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (claim.count === 0) return false;

      await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.auditLog.create({
        data: {
          organizationId: token.user.organizationId,
          actorId: token.userId,
          action: "USER_PASSWORD_RESET",
          targetId: token.userId,
        },
      });
      return true;
    });

    if (!consumed) {
      return NextResponse.json({ error: "validation.resetLinkInvalid" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, organizationSlug: token.user.organization.slug });
  } catch (error) {
    console.error("[reset-password]", error);
    return NextResponse.json({ error: t("errors.serverError") }, { status: 500 });
  }
}
