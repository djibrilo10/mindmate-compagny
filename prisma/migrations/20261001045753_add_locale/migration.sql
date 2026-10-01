-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "defaultLocale" TEXT NOT NULL DEFAULT 'fr';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "locale" TEXT;
