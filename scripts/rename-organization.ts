import { PrismaClient } from "@prisma/client";
import { slugify } from "../lib/slug";

const prisma = new PrismaClient();

// ------------------------------------------------------------
// Renomme l'identifiant de connexion (Organization.slug) d'une
// organisation — et, en option, son nom affiché (Organization.name).
// Aucune interface ne permet de faire ça aujourd'hui (le slug est choisi
// une seule fois, à l'inscription, voir AUDIT.md 7.1) : ce script comble ce
// trou pour un usage ponctuel, plutôt que de construire une UI pour un
// besoin qui ne se représentera pas souvent.
//
// Sans danger pour les comptes déjà connectés : le token de session
// contient l'ID de l'organisation, jamais son slug — seules les PROCHAINES
// connexions devront utiliser le nouvel identifiant.
//
// Lancer avec :
//   npx tsx scripts/rename-organization.ts <identifiant-actuel> <nouvel-identifiant> [nouveau-nom-affiché]
//
// Exemple :
//   npx tsx scripts/rename-organization.ts minmate-compagny mindmate-compagny "Mindmate Compagny"
// ------------------------------------------------------------

async function main() {
  const [currentSlugArg, newSlugArg, newName] = process.argv.slice(2);

  if (!currentSlugArg || !newSlugArg) {
    console.error(
      "Usage : npx tsx scripts/rename-organization.ts <identifiant-actuel> <nouvel-identifiant> [nouveau-nom-affiché]"
    );
    process.exit(1);
  }

  const currentSlug = currentSlugArg.toLowerCase().trim();
  const newSlug = slugify(newSlugArg); // même normalisation que /register, pour rester cohérent

  if (!newSlug) {
    console.error(`"${newSlugArg}" ne donne aucun identifiant valide une fois normalisé.`);
    process.exit(1);
  }

  const organization = await prisma.organization.findUnique({ where: { slug: currentSlug } });
  if (!organization) {
    console.error(`Aucune organisation trouvée avec l'identifiant "${currentSlug}".`);
    process.exit(1);
  }

  if (newSlug !== currentSlug) {
    const clash = await prisma.organization.findUnique({ where: { slug: newSlug } });
    if (clash) {
      console.error(`L'identifiant "${newSlug}" est déjà pris par une autre organisation.`);
      process.exit(1);
    }
  }

  const updated = await prisma.organization.update({
    where: { id: organization.id },
    data: {
      slug: newSlug,
      ...(newName ? { name: newName } : {}),
    },
  });

  console.log(`✅ Organisation mise à jour :`);
  console.log(`   Identifiant de connexion : "${organization.slug}" → "${updated.slug}"`);
  if (newName) {
    console.log(`   Nom affiché : "${organization.name}" → "${updated.name}"`);
  } else {
    console.log(`   Nom affiché inchangé : "${updated.name}"`);
  }
  console.log(`   Utilisez "${updated.slug}" comme identifiant d'entreprise à la prochaine connexion.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
