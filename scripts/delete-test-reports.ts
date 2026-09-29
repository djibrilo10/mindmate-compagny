import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ------------------------------------------------------------
// Nettoyage one-off (29 sept. 2026, voir AUDIT.md journal) : supprime les
// signalements de TEST intitulés exactement « Test Entreprise A » (créés en
// masse le 27 sept. 2026) dans UNE organisation, ainsi que les notifications
// et lignes d'historique qui y renvoient. Aucun autre signalement n'est touché.
//
// 1) Aperçu (ne supprime rien) :
//      npx tsx scripts/delete-test-reports.ts <identifiant-entreprise>
// 2) Suppression réelle :
//      npx tsx scripts/delete-test-reports.ts <identifiant-entreprise> --confirm
// ------------------------------------------------------------

const TEST_TITLE = "Test Entreprise A";

async function main() {
  const [organizationSlug, flag] = process.argv.slice(2);
  const confirm = flag === "--confirm";

  if (!organizationSlug) {
    console.error("Usage : npx tsx scripts/delete-test-reports.ts <identifiant-entreprise> [--confirm]");
    process.exit(1);
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug.toLowerCase().trim() },
    select: { id: true, name: true },
  });
  if (!organization) {
    console.error(`Aucune organisation trouvée avec l'identifiant "${organizationSlug}".`);
    process.exit(1);
  }

  const reports = await prisma.report.findMany({
    where: { organizationId: organization.id, title: TEST_TITLE },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const reportIds = reports.map((r) => r.id);

  const notificationsWhere = {
    organizationId: organization.id,
    type: "REPORT_CREATED",
    body: TEST_TITLE,
  };
  const auditWhere = {
    organizationId: organization.id,
    action: "REPORT_CREATED",
    targetId: { in: reportIds },
  };

  const [notificationCount, auditCount, otherReports] = await Promise.all([
    prisma.notification.count({ where: notificationsWhere }),
    reportIds.length ? prisma.auditLog.count({ where: auditWhere }) : Promise.resolve(0),
    prisma.report.count({ where: { organizationId: organization.id, title: { not: TEST_TITLE } } }),
  ]);

  console.log(`Organisation : ${organization.name}`);
  console.log(`Signalements « ${TEST_TITLE} » : ${reports.length}`);
  if (reports.length) {
    console.log(`  du ${reports[0].createdAt.toLocaleString("fr-CA")} au ${reports[reports.length - 1].createdAt.toLocaleString("fr-CA")}`);
  }
  console.log(`Notifications liées : ${notificationCount}`);
  console.log(`Lignes d'historique liées : ${auditCount}`);
  console.log(`Autres signalements (conservés) : ${otherReports}`);

  if (!confirm) {
    console.log("\nAperçu seulement. Relance avec --confirm pour supprimer.");
    return;
  }

  const [deletedNotifications, deletedAudit, deletedReports] = await prisma.$transaction([
    prisma.notification.deleteMany({ where: notificationsWhere }),
    prisma.auditLog.deleteMany({ where: auditWhere }),
    prisma.report.deleteMany({ where: { organizationId: organization.id, title: TEST_TITLE } }),
  ]);

  console.log(
    `\nSupprimé : ${deletedReports.count} signalements, ${deletedNotifications.count} notifications, ${deletedAudit.count} lignes d'historique.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
