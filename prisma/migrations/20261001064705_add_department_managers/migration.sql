-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#3F6FB0';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "departmentConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "department_managers" (
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "department_managers_pkey" PRIMARY KEY ("departmentId","userId")
);

-- CreateIndex
CREATE INDEX "department_managers_userId_idx" ON "department_managers"("userId");

-- CreateIndex
CREATE INDEX "department_managers_organizationId_idx" ON "department_managers"("organizationId");

-- AddForeignKey
ALTER TABLE "department_managers" ADD CONSTRAINT "department_managers_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "department_managers" ADD CONSTRAINT "department_managers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
