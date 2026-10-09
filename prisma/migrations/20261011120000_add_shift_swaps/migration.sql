-- CreateEnum
CREATE TYPE "ShiftSwapStatus" AS ENUM ('OPEN', 'ACCEPTED', 'APPROVED', 'REJECTED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "shift_swaps" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "takenById" TEXT,
    "status" "ShiftSwapStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_swaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_swaps_organizationId_status_idx" ON "shift_swaps"("organizationId", "status");

-- CreateIndex
CREATE INDEX "shift_swaps_shiftId_idx" ON "shift_swaps"("shiftId");

-- AddForeignKey
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
