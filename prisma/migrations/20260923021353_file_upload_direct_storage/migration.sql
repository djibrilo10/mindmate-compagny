/*
  Warnings:

  - You are about to drop the column `fileType` on the `file_uploads` table. All the data in the column will be lost.
  - You are about to drop the column `fileUrl` on the `file_uploads` table. All the data in the column will be lost.
  - Added the required column `data` to the `file_uploads` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileSize` to the `file_uploads` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mimeType` to the `file_uploads` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "file_uploads" DROP COLUMN "fileType",
DROP COLUMN "fileUrl",
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'other',
ADD COLUMN     "data" BYTEA NOT NULL,
ADD COLUMN     "fileSize" INTEGER NOT NULL,
ADD COLUMN     "mimeType" TEXT NOT NULL;
