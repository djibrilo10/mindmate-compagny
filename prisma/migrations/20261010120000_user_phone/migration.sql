-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_phone_key" ON "users"("organizationId", "phone");
