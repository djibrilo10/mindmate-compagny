-- AlterEnum
ALTER TYPE "AbsenceStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "absence_requests" ADD COLUMN     "days" DOUBLE PRECISION,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "decisionNote" TEXT,
ADD COLUMN     "halfDay" TEXT,
ADD COLUMN     "leaveTypeId" TEXT,
ALTER COLUMN "reason" SET DEFAULT '';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "leaveYearStartMonth" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT,
    "color" TEXT NOT NULL DEFAULT '#1F8A6E',
    "daysPerYear" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balance_adjustments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_balance_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leave_types_organizationId_idx" ON "leave_types"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organizationId_code_key" ON "leave_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "leave_balance_adjustments_organizationId_year_idx" ON "leave_balance_adjustments"("organizationId", "year");

-- CreateIndex
CREATE INDEX "leave_balance_adjustments_userId_idx" ON "leave_balance_adjustments"("userId");

-- CreateIndex
CREATE INDEX "absence_requests_userId_idx" ON "absence_requests"("userId");

-- AddForeignKey
ALTER TABLE "absence_requests" ADD CONSTRAINT "absence_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "leave_balance_adjustments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "leave_balance_adjustments_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
