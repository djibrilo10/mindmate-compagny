import { normalizePhone } from "@/lib/phone";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { joinSchema } from "@/lib/validations/auth";
import { normalizeInviteCode } from "@/lib/invite-code";
import { notifyUsersLocalized } from "@/lib/notifications";
import { departmentManagerIds } from "@/lib/departments";
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
  // Courriel et/ou téléphone (au moins un, vérifié par joinSchema) — AUDIT.md 7.40.
  const normalizedEmail = email ? email.toLowerCase().trim() : null;
  const normalizedPhone = normalizePhone(parsed.data.phone);

  const organization = await prisma.organization.findUnique({
    where: { inviteCode: normalizedCode },
  });

  // L'entreprise de démonstration (AUDIT.md 7.43) n'accepte aucune inscription.
  if (!organization || organization.isDemo) {
    return NextResponse.json(
      { error: t("errors.invalidInviteCode") },
      { status: 400 }
    );
  }

  // L'email est unique PAR organisation (@@unique([organizationId, email])) :
  // contrairement à /api/auth/register, l'organisation existe déjà ici et
  // peut donc déjà contenir cet email — on vérifie explicitement.
  if (normalizedEmail) {
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
  }
  if (normalizedPhone) {
    const existingPhone = await prisma.user.findUnique({
      where: { organizationId_phone: { organizationId: organization.id, phone: normalizedPhone } },
    });
    if (existingPhone) {
      return NextResponse.json({ error: t("errors.phoneTakenInOrg") }, { status: 409 });
    }
  }

  const passwordHash = await hashPassword(password);

  // Département CHOISI par l'employé parmi ceux créés par l'admin principal
  // (AUDIT.md 7.34). Un seul département dans l'entreprise : choisi d'office.
  // Plusieurs : le choix est obligatoire.
  const departments = await prisma.department.findMany({
    where: { organizationId: organization.id },
    select: { id: true, name: true },
  });
  const chosenDepartment =
    departments.length === 1
      ? departments[0]
      : departments.find((d) => d.id === body?.departmentId) ?? null;
  if (departments.length > 1 && !chosenDepartment) {
    return NextResponse.json({ error: t("departments.errors.chooseOne") }, { status: 400 });
  }

  // Langue CHOISIE sur la page d'inscription (bouton FR/EN) : gardée sur le
  // compte. Sans choix explicite, le compte suit la langue de l'entreprise.
  const chosenLocale = (await cookies()).get(LOCALE_COOKIE)?.value;

  let user;
  try {
    user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        departmentId: chosenDepartment?.id ?? null,
        departmentConfirmedAt: chosenDepartment ? new Date() : null,
        firstName,
        lastName,
        email: normalizedEmail,
        phone: normalizedPhone,
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

  // Prévenir les admins + les responsables du département choisi (7.34),
  // chacun dans sa langue.
  const admins = await prisma.user.findMany({
    where: { organizationId: organization.id, status: "ACTIVE", role: "ORG_ADMIN" },
    select: { id: true },
  });
  const managers = await departmentManagerIds(chosenDepartment?.id);
  await notifyUsersLocalized(organization.id, [...admins.map((a) => a.id), ...managers], (tt) => ({
    type: "USER_JOINED",
    title: tt("departments.notif.newEmployeeTitle"),
    body: chosenDepartment
      ? tt("departments.notif.newEmployeeBodyDept", { name: `${firstName} ${lastName}`, department: chosenDepartment.name })
      : tt("departments.notif.newEmployeeBody", { name: `${firstName} ${lastName}` }),
    link: "/dashboard/employees",
  }));

  // Le client a besoin du slug pour se connecter tout de suite après
  // (signIn("credentials", ...) exige organizationSlug, voir JoinForm.tsx).
  return NextResponse.json(
    { success: true, organizationSlug: organization.slug, organizationName: organization.name },
    { status: 201 }
  );
}
