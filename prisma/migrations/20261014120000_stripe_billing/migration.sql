-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "stripeSubscriptionItemId" TEXT,
ADD COLUMN     "billingStatus" TEXT,
ADD COLUMN     "billingQuantity" INTEGER,
ADD COLUMN     "billingPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "billingGraceUntil" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripeCustomerId_key" ON "organizations"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_stripeSubscriptionId_key" ON "organizations"("stripeSubscriptionId");
