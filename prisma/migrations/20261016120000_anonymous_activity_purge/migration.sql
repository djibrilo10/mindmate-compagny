-- AUDIT.md 7.50 : l'historique d'activité ne doit plus permettre de relier
-- un signalement ou un avis ANONYME à son auteur. On efface l'auteur,
-- l'identifiant et la note des lignes déjà enregistrées.
UPDATE "audit_logs"
SET "actorId" = NULL, "targetId" = NULL, "metadata" = NULL
WHERE "action" = 'REPORT_CREATED'
  AND "targetId" IN (SELECT "id" FROM "reports" WHERE "isAnonymous" = true);

UPDATE "audit_logs"
SET "actorId" = NULL, "targetId" = NULL, "metadata" = NULL
WHERE "action" = 'REVIEW_SUBMITTED'
  AND "targetId" IN (SELECT "id" FROM "reviews" WHERE "isAnonymous" = true);
