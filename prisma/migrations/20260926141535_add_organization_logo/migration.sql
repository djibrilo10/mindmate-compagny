-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "logoData" BYTEA,
ADD COLUMN     "logoMimeType" TEXT,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3);
