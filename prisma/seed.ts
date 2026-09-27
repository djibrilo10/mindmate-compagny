import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

// ------------------------------------------------------------
// Ce script crée des données de test réalistes :
// Entreprise A (grande, 500 employés simulés en partie) et
// Entreprise B (petite), comme dans votre exemple d'origine.
// Lancer avec : npx prisma db seed
// ------------------------------------------------------------

async function main() {
  // --- Entreprise A ---
  const orgA = await prisma.organization.create({
    data: { name: "Entreprise A", slug: "entreprise-a", plan: "enterprise" },
  });

  const deptA1 = await prisma.department.create({
    data: { organizationId: orgA.id, name: "Ressources Humaines" },
  });
  const deptA2 = await prisma.department.create({
    data: { organizationId: orgA.id, name: "Informatique" },
  });

  const adminAPassword = await hashPassword("MotDePasse123!");
  const adminA = await prisma.user.create({
    data: {
      organizationId: orgA.id,
      departmentId: deptA1.id,
      email: "admin@entreprisea.com",
      passwordHash: adminAPassword,
      firstName: "Alice",
      lastName: "Admin",
      role: "ORG_ADMIN",
    },
  });

  const employeeAPassword = await hashPassword("MotDePasse123!");
  await prisma.user.create({
    data: {
      organizationId: orgA.id,
      departmentId: deptA2.id,
      email: "employe@entreprisea.com",
      passwordHash: employeeAPassword,
      firstName: "Bob",
      lastName: "Employé",
      role: "EMPLOYEE",
    },
  });

  await prisma.jobPosting.create({
    data: {
      organizationId: orgA.id,
      title: "Développeur Full-Stack",
      description: "Rejoignez notre équipe IT en pleine croissance.",
      status: "OPEN",
    },
  });

  // --- Entreprise B ---
  const orgB = await prisma.organization.create({
    data: { name: "Entreprise B", slug: "entreprise-b", plan: "free" },
  });

  const deptB1 = await prisma.department.create({
    data: { organizationId: orgB.id, name: "Ventes" },
  });

  const adminBPassword = await hashPassword("MotDePasse123!");
  await prisma.user.create({
    data: {
      organizationId: orgB.id,
      departmentId: deptB1.id,
      email: "admin@entrepriseb.com",
      passwordHash: adminBPassword,
      firstName: "Chantal",
      lastName: "Directrice",
      role: "ORG_ADMIN",
    },
  });

  console.log("✅ Données de test créées :");
  console.log("   Entreprise A -> admin@entreprisea.com / MotDePasse123!");
  console.log("   Entreprise A -> employe@entreprisea.com / MotDePasse123!");
  console.log("   Entreprise B -> admin@entrepriseb.com / MotDePasse123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
