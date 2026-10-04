import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ------------------------------------------------------------
// Nettoyage one-off (3 oct. 2026, voir AUDIT.md journal) : supprime
// DÉFINITIVEMENT toutes les organisations au statut SUSPENDED (organisations
// de test inutilisées) et TOUT leur contenu (employés, absences, annonces,
// fichiers, messages, sondages, historique, etc.) grâce aux onDelete: Cascade
// du schéma Prisma. IRRÉVERSIBLE.
//
// Sécurités :
//   - seules les organisations SUSPENDED sont visées (les ACTIVE ne sont jamais touchées) ;
//   - une organisation qui contient un compte SUPER_ADMIN n'est jamais supprimée ;
//   - sans --confirm, le script affiche seulement un aperçu.
//
// 1) Aperçu (ne supprime rien) :
//      npx tsx scripts/delete-suspended-organizations.ts
// 2) Suppression réelle :
//      npx tsx scripts/delete-suspended-organizations.ts --confirm
// ------------------------------------------------------------

async function main() {
  const confirm = process.argv.slice(2).includes("--confirm");

  const suspended = await prisma.organization.findMany({
    where: { status: "SUSPENDED" },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const kept = await prisma.organization.findMany({
    where: { status: { not: "SUSPENDED" } },
    select: { name: true, slug: true },
  });

  if (suspended.length === 0) {
    console.log("Aucune organisation suspendue. Rien à supprimer.");
    return;
  }

  // Ne jamais supprimer une organisation qui contient le compte propriétaire.
  const protectedOrgs = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN", organizationId: { in: suspended.map((o) => o.id) } },
    select: { organizationId: true },
  });
  const protectedIds = new Set(protectedOrgs.map((u) => u.organizationId));
  const toDelete = suspended.filter((o) => !protectedIds.has(o.id));

  console.log("Organisations SUSPENDUES qui seront supprimées définitivement :");
  for (const o of toDelete) {
    console.log(`  - ${o.name} (${o.slug}) — ${o._count.users} employé(s), créée le ${o.createdAt.toLocaleDateString("fr-CA")}`);
  }
  for (const o of suspended.filter((o) => protectedIds.has(o.id))) {
    console.log(`  ! ${o.name} (${o.slug}) IGNORÉE : contient le compte propriétaire (SUPER_ADMIN).`);
  }
  console.log("\nOrganisations conservées :");
  for (const o of kept) console.log(`  - ${o.name} (${o.slug})`);

  if (!confirm) {
    console.log("\nAperçu seulement. Relance avec --confirm pour supprimer.");
    return;
  }
  if (toDelete.length === 0) return;

  const result = await prisma.organization.deleteMany({
    where: { id: { in: toDelete.map((o) => o.id) }, status: "SUSPENDED" },
  });

  console.log(`\nSupprimé définitivement : ${result.count} organisation(s) et tout leur contenu.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
