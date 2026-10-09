-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "trialEndedNotifiedAt" TIMESTAMP(3);
