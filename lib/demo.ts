// ------------------------------------------------------------
// Démo publique (AUDIT.md 7.43) : une entreprise FICTIVE (Organization.isDemo)
// que les visiteurs de la page d'accueil explorent sans mot de passe, en
// lecture seule. Données créées par scripts/seed-demo.ts.
// Sans dépendance serveur : importable partout.
// ------------------------------------------------------------

export const DEMO_ORG_SLUG = "demo";

/** Les deux comptes de la démo : la vue gérant et la vue employé. */
export const DEMO_ACCOUNTS = {
  manager: "gerant@demo.mindmatecompagny.com",
  employee: "employe@demo.mindmatecompagny.com",
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

export function isDemoRole(value: unknown): value is DemoRole {
  return value === "manager" || value === "employee";
}
