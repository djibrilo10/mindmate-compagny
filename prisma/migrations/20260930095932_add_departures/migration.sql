-- CreateEnum
CREATE TYPE "DepartureType" AS ENUM ('RESIGNATION', 'END_OF_CONTRACT', 'DISMISSAL', 'RETIREMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DepartureStatus" AS ENUM ('PENDING_SURVEY', 'COMPLETED', 'NO_SURVEY');

-- CreateTable
CREATE TABLE "departures" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recordedById" TEXT,
    "type" "DepartureType" NOT NULL DEFAULT 'RESIGNATION',
    "status" "DepartureStatus" NOT NULL DEFAULT 'PENDING_SURVEY',
    "lastDay" TIMESTAMP(3) NOT NULL,
    "departmentId" TEXT,
    "hireDate" TIMESTAMP(3),
    "primaryReason" TEXT,
    "secondaryReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "details" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ratingManager" INTEGER,
    "ratingGrowth" INTEGER,
    "ratingWorkload" INTEGER,
    "ratingPay" INTEGER,
    "ratingAtmosphere" INTEGER,
    "ratingRecognition" INTEGER,
    "couldBeRetained" TEXT,
    "retentionLever" TEXT,
    "wouldRecommend" TEXT,
    "wouldReturn" TEXT,
    "comment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "departures_organizationId_idx" ON "departures"("organizationId");

-- CreateIndex
CREATE INDEX "departures_organizationId_lastDay_idx" ON "departures"("organizationId", "lastDay");

-- CreateIndex
CREATE INDEX "departures_userId_idx" ON "departures"("userId");

-- AddForeignKey
ALTER TABLE "departures" ADD CONSTRAINT "departures_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departures" ADD CONSTRAINT "departures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departures" ADD CONSTRAINT "departures_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
