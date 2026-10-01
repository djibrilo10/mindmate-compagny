import { z } from "zod";

// ------------------------------------------------------------
// Questionnaire de départ FIXE — Employee Retention Intelligence (AUDIT.md 7.26).
// Fichier SANS accès base de données : importable côté navigateur (formulaire)
// comme côté serveur (validation, analyses dans lib/retention.ts).
// Les codes sont stockés en base ; ne jamais renommer un code existant,
// seulement son libellé (sinon l'historique ne serait plus reconnu).
// ------------------------------------------------------------

export const REASONS = {
  CAREER: {
    label: "Manque d'évolution",
    details: {
      CAREER_NO_PROMOTION: "Pas de promotion possible",
      CAREER_NO_TRAINING: "Pas de formation / développement",
      CAREER_REPETITIVE: "Tâches répétitives, peu de défis",
      CAREER_NO_PATH: "Aucun plan de carrière clair",
    },
  },
  MANAGEMENT: {
    label: "Management",
    details: {
      MGMT_NO_RECOGNITION: "Manque de reconnaissance",
      MGMT_COMMUNICATION: "Mauvaise communication",
      MGMT_CONFLICT: "Conflit avec le gérant",
      MGMT_MICROMANAGEMENT: "Microgestion, manque d'autonomie",
      MGMT_UNFAIR: "Traitement injuste / favoritisme",
    },
  },
  WORKLOAD: {
    label: "Charge de travail",
    details: {
      WORK_TOO_HEAVY: "Trop de travail",
      WORK_OVERTIME: "Heures supplémentaires fréquentes",
      WORK_STRESS: "Stress / épuisement",
      WORK_UNDERSTAFFED: "Manque de personnel",
    },
  },
  PAY: {
    label: "Rémunération",
    details: {
      PAY_BELOW_MARKET: "Salaire inférieur au marché",
      PAY_NO_RAISE: "Pas d'augmentation",
      PAY_BENEFITS: "Avantages sociaux insuffisants",
      PAY_BETTER_OFFER: "Meilleure offre ailleurs",
    },
  },
  CULTURE: {
    label: "Ambiance / culture",
    details: {
      CULTURE_COLLEAGUES: "Difficultés avec des collègues",
      CULTURE_TEAM_SPIRIT: "Manque d'esprit d'équipe",
      CULTURE_VALUES: "Valeurs de l'entreprise",
      CULTURE_BEHAVIOR: "Comportements inappropriés",
    },
  },
  WORKLIFE: {
    label: "Horaires / équilibre de vie",
    details: {
      WL_SCHEDULE: "Horaires peu flexibles",
      WL_REMOTE: "Pas de télétravail",
      WL_COMMUTE: "Trajet trop long",
      WL_SHIFTS: "Quarts de travail difficiles (nuit, fin de semaine)",
    },
  },
  PERSONAL: {
    label: "Raisons personnelles",
    details: {
      PERS_MOVING: "Déménagement",
      PERS_FAMILY: "Raisons familiales",
      PERS_HEALTH: "Santé",
      PERS_STUDIES: "Retour aux études",
    },
  },
  OTHER: {
    label: "Autre",
    details: {},
  },
} as const;

export type ReasonCode = keyof typeof REASONS;
export const REASON_CODES = Object.keys(REASONS) as ReasonCode[];

export const DETAIL_LABELS: Record<string, string> = Object.fromEntries(
  REASON_CODES.flatMap((code) => Object.entries(REASONS[code].details))
);
/** Raison parente d'une sous-cause, ex. "PAY_NO_RAISE" -> "PAY". */
export const DETAIL_PARENT: Record<string, ReasonCode> = Object.fromEntries(
  REASON_CODES.flatMap((code) => Object.keys(REASONS[code].details).map((d) => [d, code]))
);

export const RATING_DIMENSIONS = {
  ratingManager: "Relation avec le gérant",
  ratingGrowth: "Possibilités d'évolution",
  ratingWorkload: "Charge de travail",
  ratingPay: "Rémunération",
  ratingAtmosphere: "Ambiance d'équipe",
  ratingRecognition: "Reconnaissance",
} as const;
export type RatingKey = keyof typeof RATING_DIMENSIONS;
export const RATING_KEYS = Object.keys(RATING_DIMENSIONS) as RatingKey[];

export const LEVERS = {
  PROMOTION: "Une promotion / plus d'évolution",
  RAISE: "Une augmentation de salaire",
  MANAGER_CHANGE: "Un changement de gérant ou d'équipe",
  FLEXIBILITY: "Plus de flexibilité (horaires, télétravail)",
  TRAINING: "De la formation",
  LESS_WORKLOAD: "Moins de charge de travail",
  RECOGNITION: "Plus de reconnaissance",
  NOTHING: "Rien, ma décision était prise",
} as const;
export type LeverCode = keyof typeof LEVERS;

export const TRI_LABELS = { YES: "Oui", MAYBE: "Peut-être", NO: "Non" } as const;

export const DEPARTURE_TYPE_LABELS: Record<string, string> = {
  RESIGNATION: "Démission",
  END_OF_CONTRACT: "Fin de contrat",
  DISMISSAL: "Licenciement",
  RETIREMENT: "Retraite",
  OTHER: "Autre",
};

const tri = z.enum(["YES", "MAYBE", "NO"]);
const rating = z.number().int().min(1).max(5);

export const surveyAnswersSchema = z
  .object({
    primaryReason: z.enum(REASON_CODES as [ReasonCode, ...ReasonCode[]], {
      message: "Choisis la raison principale de ton départ",
    }),
    secondaryReasons: z.array(z.enum(REASON_CODES as [ReasonCode, ...ReasonCode[]])).max(7).default([]),
    details: z.array(z.string()).max(30).default([]),
    ratingManager: rating,
    ratingGrowth: rating,
    ratingWorkload: rating,
    ratingPay: rating,
    ratingAtmosphere: rating,
    ratingRecognition: rating,
    couldBeRetained: tri,
    retentionLever: z.enum(Object.keys(LEVERS) as [LeverCode, ...LeverCode[]]).optional(),
    wouldRecommend: tri,
    wouldReturn: tri,
    comment: z.string().trim().max(2000, "Commentaire trop long (2000 caractères max)").optional(),
  })
  .transform((a) => {
    // Nettoyage : raisons secondaires sans doublon ni raison principale ;
    // sous-causes limitées aux raisons cochées (principale + secondaires).
    const secondary = Array.from(new Set(a.secondaryReasons)).filter((r) => r !== a.primaryReason);
    const allowed = new Set<string>([a.primaryReason, ...secondary]);
    const details = Array.from(new Set(a.details)).filter((d: string) => DETAIL_PARENT[d] && allowed.has(DETAIL_PARENT[d]));
    return {
      ...a,
      secondaryReasons: secondary,
      details,
      retentionLever: a.couldBeRetained === "NO" ? undefined : a.retentionLever,
      comment: a.comment || undefined,
    };
  });

export type SurveyAnswers = z.output<typeof surveyAnswersSchema>;


// ---------- Transition / remise (fin d'emploi, AUDIT.md 7.27) ----------

export type HandoverItem = { id: string; label: string; done: boolean; doneAt?: string | null };

/** Liste de remise proposée par défaut ; l'admin principal peut en retirer ou en ajouter. */
export const DEFAULT_HANDOVER_ITEMS: string[] = [
  "Remise et transfert des dossiers en cours",
  "Remise des clés",
  "Remise du badge / carte d'accès",
  "Retour du matériel (ordinateur, téléphone, uniforme…)",
  "Fermeture des accès informatiques (courriel, logiciels)",
  "Documents de fin d'emploi (dernière paie, relevé d'emploi)",
];

export const MAX_HANDOVER_ITEMS = 20;
