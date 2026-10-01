-- Confidentialité (AUDIT.md 7.28) : la durée de conservation n'a plus de
-- valeur par défaut, c'est l'admin principal qui la choisit.
-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "dataRetentionMonths" DROP NOT NULL,
ALTER COLUMN "dataRetentionMonths" DROP DEFAULT;

-- Les 36 mois posés automatiquement par la migration add_privacy sont retirés,
-- sauf pour une organisation dont l'admin principal a déjà enregistré un choix.
UPDATE "organizations" SET "dataRetentionMonths" = NULL
WHERE "id" NOT IN (
  SELECT DISTINCT "organizationId" FROM "audit_logs" WHERE "action" = 'ORGANIZATION_PRIVACY_UPDATED'
);
