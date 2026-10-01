import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { joinSchema } from "@/lib/validations/auth";
import { normalizeInviteCode } from "@/lib/invite-code";
import { notifyRoles } from "@/lib/notifications";
import { cookies } from "next/headers";
import { getI18n } from "@/lib/i18n/server";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

// ------------------------------------------------------------
// Miroir de /api/auth/register (voir ce fichier pour le pattern de base),
// mais on rattache le nouvel utilisateur à une organisation EXISTANTE
// trouvée via son code d'invitation, plutôt que d'en créer une nouvelle.
// Route volontairement PUBLIQUE (pas dans middleware.ts matcher, comme
// /api/auth/register) : c'est justement le point d'entrée pour quelqu'un
// qui n'a pas encore de compte. Voir AUDIT.md 7.18.
// ------------------------------------------------------------

export async function POST(request: Request) {
  const { t } = await getI18n();
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: t("errors.invalidRequest") }, { status: 400 });
  }

  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "errors.invalidData" },
      { status: 400 }
    );
  }

  const { firstName, lastName, email, password } = parsed.data;
  const normalizedCode = normalizeInviteCode(parsed.data.inviteCode);
  const normalizedEmail = email.toLowerCase().trim();

  const organization = await prisma.organization.findUnique({
    where: { inviteCode: normalizedCode },
  });

  if (!organization) {
    return NextResponse.json(
      { error: t("errors.invalidInviteCode") },
      { status: 400 }
    );
  }

  // L'email est unique PAR organisation (@@unique([organizationId, email])) :
  // contrairement à /api/auth/register, l'organisation existe déjà ici et
  // peut donc déjà contenir cet email — on vérifie explicitement.
  const existingUser = await prisma.user.findUnique({
    where: {
      organizationId_email: { organizationId: organization.id, email: normalizedEmail },
    },
  });
  if (existingUser) {
    return NextResponse.json(
      { error: t("errors.emailTakenInOrg") },
      { status: 409 }
    );
  }

  const passwordHash = await hashPassword(password);

  // Département par défaut : on rattache au département "Général" créé à
  // l'inscription de l'entreprise, s'il existe encore. Sinon l'employé
  // reste sans département (assignable ensuite depuis la page Employés) —
  // ce n'est jamais bloquant pour la création du compte.
  const generalDepartment = await prisma.department.findUnique({
    where: { organizationId_name: { organizationId: organization.id, name: "Général" } },
  });

  // Langue CHOISIE sur la page d'inscription (bouton FR/EN) : gardée sur le
  // compte. Sans choix explicite, le compte suit la langue de l'entreprise.
  const chosenLocale = (await cookies()).get(LOCALE_COOKIE)?.value;

  let user;
  try {
    user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        departmentId: generalDepartment?.id ?? null,
        firstName,
        lastName,
        email: normalizedEmail,
        passwordHash,
        role: "EMPLOYEE",
        status: "ACTIVE", // actif immédiatement, pas d'approbation admin (voir AUDIT.md 7.18)
        locale: isLocale(chosenLocale) ? chosenLocale : null,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la création du compte via code d'invitation :", error);
    return NextResponse.json(
      { error: t("errors.accountCreateFailed") },
      { status: 500 }
    );
  }

  await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorId: user.id,
      action: "USER_JOINED",
      targetId: user.id,
    },
  });

  // Prévenir les admins/gérants qu'un nouvel employé vient de s'inscrire
  // lui-même — même pattern que les autres événements notifiés (7.15).
  await notifyRoles(organization.id, ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"], {
    type: "USER_JOINED",
    title: "Nouvel employé",
    body: `${firstName} ${lastName} a rejoint l'organisation via le code d'invitation.`,
    link: "/dashboard/employees",
  });

  // Le client a besoin du slug pour se connecter tout de suite après
  // (signIn("credentials", ...) exige organizationSlug, voir JoinForm.tsx).
  return NextResponse.json(
    { success: true, organizationSlug: organization.slug, organizationName: organization.name },
    { status: 201 }
  );
}
