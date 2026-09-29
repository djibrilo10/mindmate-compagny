// ------------------------------------------------------------
// Invisibilité du propriétaire de la plateforme (voir AUDIT.md 7.24).
//
// Le compte SUPER_ADMIN (le créateur de l'application) appartient
// techniquement à une organisation, mais il ne doit JAMAIS apparaître aux
// yeux des employés ni des admins : liste des employés, compteurs,
// départements, nouvelles recrues, exports, historique, messagerie,
// notifications collectives… Toute requête qui LISTE ou COMPTE des
// utilisateurs d'une organisation doit ajouter `...VISIBLE_USER` à son where.
// ------------------------------------------------------------

export const VISIBLE_USER = { role: { not: "SUPER_ADMIN" as const } };
