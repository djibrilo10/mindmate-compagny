-- CreateTable
CREATE TABLE "schedule_files" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "departmentId" TEXT,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_files_organizationId_week_idx" ON "schedule_files"("organizationId", "week");

-- AddForeignKey
ALTER TABLE "schedule_files" ADD CONSTRAINT "schedule_files_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_files" ADD CONSTRAINT "schedule_files_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
