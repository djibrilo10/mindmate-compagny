-- AlterTable
ALTER TABLE "departures" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "handoverItems" JSONB,
ADD COLUMN     "privacyNoticeAt" TIMESTAMP(3),
ADD COLUMN     "transitionAt" TIMESTAMP(3),
ADD COLUMN     "transitionLocation" TEXT,
ADD COLUMN     "transitionNotes" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "dataRetentionMonths" INTEGER NOT NULL DEFAULT 36,
ADD COLUMN     "lastPrivacyPurgeAt" TIMESTAMP(3),
ADD COLUMN     "privacyOfficerEmail" TEXT,
ADD COLUMN     "privacyOfficerName" TEXT;

-- AlterTable
ALTER TABLE "survey_participations" ADD COLUMN     "privacyNoticeAt" TIMESTAMP(3);
