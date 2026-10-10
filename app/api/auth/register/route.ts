import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validations/auth";
import { slugify } from "@/lib/slug";
import { getI18n } from "@/lib/i18n/server";
import { notifyNewOrganization, trialEndFrom } from "@/lib/trial";
import { buildWelcomeEmail, sendQuietly } from "@/lib/onboarding-emails";
import { appBaseUrl } from "@/lib/password-reset";

export async function POST(request: Request) {
  // Langue de la page d'inscription (bouton FR/EN ou navigateur) : sert aux
  // messages d'erreur ET devient la langue par défaut de la nouvelle
  // entreprise (modifiable ensuite dans Paramètres, AUDIT.md 7.29).
  const { t, locale } = await getI18n();
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: t("errors.invalidRequest") }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "errors.invalidData" },
      { status: 400 }
    );
  }

  const { organizationName, firstName, lastName, email, password } = parsed.data;

  // Pas de vérification d'email en doublon ici : dans ce schéma, l'email
  // est unique PAR organisation (contrainte organizationId_email), pas
  // globalement. Comme l'organisation n'existe pas encore à ce stade,
  // il n'y a rien à comparer — la contrainte de la base s'occupera de
  // tout doublon une fois l'organisation créée.

  // organization.slug est unique globalement : on part du nom de
  // l'entreprise et on ajoute un suffixe si le slug est déjà pris.
  const baseSlug = slugify(organizationName) || "organisation";
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
    if (suffix > 50) {
      return NextResponse.json(
        { error: t("errors.slugUnavailable") },
        { status: 500 }
      );
    }
  }

  const passwordHash = await hashPassword(password);
  const trialEndsAt = trialEndFrom(new Date());

  try {
    // L'organisation et son premier compte admin sont créés dans la même
    // transaction : impossible de finir avec une organisation sans admin,
    // ou un admin sans organisation, même en cas d'erreur en cours de route.
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        // Essai gratuit de 30 jours (AUDIT.md 7.44).
        data: { name: organizationName, slug, defaultLocale: locale, plan: "trial", trialEndsAt },
      });

      const generalDepartment = await tx.department.create({
        data: {
          name: locale === "en" ? "General" : "Général",
          organizationId: organization.id,
        },
      });

      const admin = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          passwordHash,
          role: "ORG_ADMIN",
          departmentConfirmedAt: new Date(),
          organizationId: organization.id,
          departmentId: generalDepartment.id,
        },
      });

      // Le créateur de l'organisation en est l'admin PRINCIPAL (voir AUDIT.md 7.22).
      await tx.organization.update({
        where: { id: organization.id },
        data: { primaryAdminId: admin.id },
      });
    });
  } catch (error) {
    // Le vrai détail (contrainte violée, DB injoignable, etc.) s'affiche
    // dans le terminal du serveur pour le debug.
    console.error("Erreur lors de la création de l'organisation :", error);
    return NextResponse.json(
      { error: t("errors.orgCreateFailed") },
      { status: 500 }
    );
  }

  // Prévient le propriétaire de la plateforme (AUDIT.md 7.44).
  await notifyNewOrganization({ name: organizationName, slug, trialEndsAt, adminName: `${firstName} ${lastName}`, adminEmail: email ?? null });
  // Courriel de bienvenue à l'admin : les 3 premières étapes (AUDIT.md 7.46).
  if (email) {
    await sendQuietly(
      buildWelcomeEmail({ to: email, firstName, organizationName, slug, trialEndsAt, baseUrl: appBaseUrl(request), locale }),
      "bienvenue"
    );
  }

  return NextResponse.json({ success: true, slug }, { status: 201 });
}
