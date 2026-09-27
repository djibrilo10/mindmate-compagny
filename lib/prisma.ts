import { PrismaClient } from "@prisma/client";

// ------------------------------------------------------------
// Pourquoi un singleton ?
// En développement, Next.js recharge le code à chaque changement
// (hot reload). Sans cette technique, chaque rechargement créerait
// une NOUVELLE connexion à la base de données -> on finirait par
// épuiser le pool de connexions PostgreSQL en quelques minutes.
// ------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
