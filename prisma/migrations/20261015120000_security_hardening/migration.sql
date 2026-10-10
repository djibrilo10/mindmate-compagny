-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rate_limit_hits_key_createdAt_idx" ON "rate_limit_hits"("key", "createdAt");

-- CreateIndex
CREATE INDEX "rate_limit_hits_createdAt_idx" ON "rate_limit_hits"("createdAt");
