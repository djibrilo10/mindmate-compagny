import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ------------------------------------------------------------
// Usage unique : promouvoir VOTRE compte (le créateur de l'application) au
// rôle SUPER_ADMIN, pour débloquer l'accès à /platform (voir AUDIT.md 7.20).
// Il n'y a volontairement AUCUNE interface pour faire ça — un rôle qui voit
// et contrôle TOUTES les organisations clientes ne doit jamais pouvoir être
// attribué depuis l'app elle-même (n'importe quel ORG_ADMIN pourrait sinon
// tenter de se l'auto-attribuer). Ça reste une commande que vous seul lancez.
//
// Lancer avec :
//   npx tsx scripts/promote-super-admin.ts <identifiant-entreprise> <votre-email>
//
// Exemple :
//   npx tsx scripts/promote-super-admin.ts mindmate-interne moi@example.com
// ------------------------------------------------------------

async function main() {
  const [organizationSlug, email] = process.argv.slice(2);

  if (!organizationSlug || !email) {
    console.error(
      "Usage : npx tsx scripts/promote-super-admin.ts <identifiant-entreprise> <email>"
    );
    process.exit(1);
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug.toLowerCase().trim() },
  });
  if (!organization) {
    console.error(`Aucune organisation trouvée avec l'identifiant "${organizationSlug}".`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: email.toLowerCase().trim(),
      },
    },
  });
  if (!user) {
    console.error(`Aucun compte "${email}" dans l'organisation "${organizationSlug}".`);
    process.exit(1);
  }

  if (user.role === "SUPER_ADMIN") {
    console.log(`${email} est déjà SUPER_ADMIN.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "SUPER_ADMIN" },
  });

  console.log(`✅ ${email} est maintenant SUPER_ADMIN.`);
  console.log(`   Reconnectez-vous (déconnexion puis connexion) pour voir /platform.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
