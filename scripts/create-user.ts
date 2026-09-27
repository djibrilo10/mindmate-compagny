import { PrismaClient, type Role } from "@prisma/client";
import { hashPassword, isPasswordStrongEnough } from "../lib/password";

const prisma = new PrismaClient();

const VALID_ROLES: Role[] = ["SUPER_ADMIN", "ORG_ADMIN", "MANAGER", "EMPLOYEE"];

// ------------------------------------------------------------
// Crée un compte directement dans une organisation EXISTANTE, avec le rôle
// de votre choix — utile pour un second identifiant de connexion sans
// passer par /register (qui crée toujours une NOUVELLE organisation avec
// un ORG_ADMIN) ni par /join (toujours EMPLOYEE, via code d'invitation).
// Cas d'usage typique (voir AUDIT.md 7.20) : garder un compte ORG_ADMIN
// "normal" pour tester le dashboard d'une entreprise cliente, et un second
// compte SUPER_ADMIN séparé, dans la MÊME organisation, avec un alias de
// votre email (ex: vous+admin@gmail.com — les messages arrivent quand
// même dans votre boîte normale, Gmail ignore tout ce qui suit un "+").
//
// Lancer avec :
//   npx tsx scripts/create-user.ts <identifiant-entreprise> <email> <mot-de-passe> <prénom> <nom> <SUPER_ADMIN|ORG_ADMIN|MANAGER|EMPLOYEE>
// ------------------------------------------------------------

async function main() {
  const [organizationSlug, email, password, firstName, lastName, roleArg] = process.argv.slice(2);

  if (!organizationSlug || !email || !password || !firstName || !lastName || !roleArg) {
    console.error(
      "Usage : npx tsx scripts/create-user.ts <identifiant-entreprise> <email> <mot-de-passe> <prénom> <nom> <SUPER_ADMIN|ORG_ADMIN|MANAGER|EMPLOYEE>"
    );
    process.exit(1);
  }

  const role = roleArg.toUpperCase() as Role;
  if (!VALID_ROLES.includes(role)) {
    console.error(`Rôle invalide : "${roleArg}". Attendu : ${VALID_ROLES.join(", ")}.`);
    process.exit(1);
  }

  if (!isPasswordStrongEnough(password)) {
    console.error("Mot de passe trop faible : au moins 10 caractères, une majuscule, une minuscule et un chiffre.");
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();

  const organization = await prisma.organization.findUnique({
    where: { slug: organizationSlug.toLowerCase().trim() },
    include: { departments: { where: { name: "Général" }, take: 1 } },
  });
  if (!organization) {
    console.error(`Aucune organisation trouvée avec l'identifiant "${organizationSlug}".`);
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { organizationId_email: { organizationId: organization.id, email: normalizedEmail } },
  });
  if (existing) {
    console.error(`"${normalizedEmail}" a déjà un compte dans "${organizationSlug}" (rôle actuel : ${existing.role}).`);
    console.error(`Pour changer son rôle, utilisez plutôt scripts/set-user-role.ts.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      organizationId: organization.id,
      departmentId: organization.departments[0]?.id ?? null,
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      role,
    },
  });

  console.log(`✅ Compte créé : ${user.email} (${user.role}) dans "${organizationSlug}".`);
  console.log(`   Connectez-vous avec l'identifiant "${organizationSlug}", cet email et le mot de passe fourni.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
