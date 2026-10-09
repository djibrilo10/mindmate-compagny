import { PrismaClient } from "@prisma/client";
import { refreshDemoData } from "../lib/demo-seed";

const prisma = new PrismaClient();

// ------------------------------------------------------------
// Crée ou remet à neuf l'entreprise de DÉMONSTRATION « Café Boréal »
// (AUDIT.md 7.43) : 13 employés fictifs, 3 départements, horaires de
// 2 semaines passées à 8 semaines à venir, échanges de quart, congés,
// annonces, messages, sondage…
//
// Facultatif : la démo se crée toute seule au premier clic sur « Voir la
// démo » et se rafraîchit d'elle-même chaque jour. Ce script sert à la
// remettre à neuf tout de suite (par exemple juste avant une présentation).
//
// Lancer avec :
//   npx tsx scripts/seed-demo.ts
// ------------------------------------------------------------

async function main() {
  const result = await prisma.$transaction((tx) => refreshDemoData(tx), { maxWait: 10_000, timeout: 120_000 });
  console.log(`Démo prête : ${result.shifts} quarts créés. Ouvre la page d'accueil et clique sur « Vue gérant » ou « Vue employé ».`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
