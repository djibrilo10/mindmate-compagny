-- CreateTable
CREATE TABLE "company_leaves" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "departmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_leaves_organizationId_startDate_idx" ON "company_leaves"("organizationId", "startDate");

-- AddForeignKey
ALTER TABLE "company_leaves" ADD CONSTRAINT "company_leaves_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
