import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { registerSchema } from "@/lib/validations/auth";
import { slugify } from "@/lib/slug";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Données invalides." },
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
        { error: "Impossible de générer un identifiant unique pour cette entreprise. Réessayez avec un autre nom." },
        { status: 500 }
      );
    }
  }

  const passwordHash = await hashPassword(password);

  try {
    // L'organisation et son premier compte admin sont créés dans la même
    // transaction : impossible de finir avec une organisation sans admin,
    // ou un admin sans organisation, même en cas d'erreur en cours de route.
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: organizationName, slug },
      });

      const generalDepartment = await tx.department.create({
        data: {
          name: "Général",
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
      { error: "Impossible de créer l'organisation. Vérifiez le terminal du serveur pour le détail." },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, slug }, { status: 201 });
}
