import { PrismaClient, type Role } from "@prisma/client";

const prisma = new PrismaClient();

const VALID_ROLES: Role[] = ["SUPER_ADMIN", "ORG_ADMIN", "MANAGER", "EMPLOYEE"];

// ------------------------------------------------------------
// Change le rôle d'un utilisateur existant — outil général, sans UI
// (changer le rôle de quelqu'un n'importe où dans l'app resterait
// dangereux si exposé, voir AUDIT.md 7.20 pour la même logique appliquée
// à SUPER_ADMIN). Remplace un compte ORG_ADMIN par SUPER_ADMIN (ou
// l'inverse, pour annuler), sans passer par scripts/promote-super-admin.ts
// qui ne fait que la moitié du travail dans un seul sens.
//
// Lancer avec :
//   npx tsx scripts/set-user-role.ts <identifiant-entreprise> <email> <SUPER_ADMIN|ORG_ADMIN|MANAGER|EMPLOYEE>
// ------------------------------------------------------------

async function main() {
  const [organizationSlug, email, roleArg] = process.argv.slice(2);

  if (!organizationSlug || !email || !roleArg) {
    console.error(
      "Usage : npx tsx scripts/set-user-role.ts <identifiant-entreprise> <email> <SUPER_ADMIN|ORG_ADMIN|MANAGER|EMPLOYEE>"
    );
    process.exit(1);
  }

  const role = roleArg.toUpperCase() as Role;
  if (!VALID_ROLES.includes(role)) {
    console.error(`Rôle invalide : "${roleArg}". Attendu : ${VALID_ROLES.join(", ")}.`);
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
      organizationId_email: { organizationId: organization.id, email: email.toLowerCase().trim() },
    },
  });
  if (!user) {
    console.error(`Aucun compte "${email}" dans l'organisation "${organizationSlug}".`);
    process.exit(1);
  }

  if (user.role === role) {
    console.log(`${email} a déjà le rôle ${role}.`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role } });

  console.log(`✅ ${email} : ${user.role} → ${role}.`);
  console.log(`   Reconnectez-vous avec ce compte (déconnexion puis connexion) pour que ça prenne effet.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
