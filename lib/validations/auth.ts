import { z } from "zod";

export const registerSchema = z.object({
  organizationName: z
    .string()
    .min(2, "Le nom de l'entreprise doit contenir au moins 2 caractères")
    .max(100, "Le nom de l'entreprise est trop long"),
  firstName: z
    .string()
    .min(1, "Entrez votre prénom")
    .max(50, "Ce prénom est trop long"),
  lastName: z
    .string()
    .min(1, "Entrez votre nom")
    .max(50, "Ce nom est trop long"),
  email: z.string().trim().email("Entrez une adresse courriel valide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .regex(/[A-Z]/, "Ajoutez au moins une majuscule")
    .regex(/[0-9]/, "Ajoutez au moins un chiffre"),
});

export const loginSchema = z.object({
  organizationSlug: z.string().min(1, "Entrez l'identifiant de votre entreprise"),
  // .trim() avant .email() : les claviers mobiles (surtout avec l'auto-complétion
  // du domaine, ex. "@gmail.com" suggéré) ajoutent parfois un espace en fin de
  // saisie, invisible à l'œil, qui faisait échouer la validation même pour une
  // adresse par ailleurs correcte (ex. un alias "+admin@..." plus long, donc
  // plus susceptible de déclencher l'auto-complétion) — voir AUDIT.md.
  email: z.string().trim().email("Entrez une adresse courriel valide"),
  password: z.string().min(1, "Entrez votre mot de passe"),
});

// Auto-inscription d'un employé via le code d'invitation de son
// organisation (voir lib/invite-code.ts et AUDIT.md 7.18). Mêmes règles de
// mot de passe que registerSchema, par cohérence.
export const joinSchema = z.object({
  inviteCode: z
    .string()
    .min(1, "Entrez le code d'invitation fourni par votre administrateur"),
  firstName: z
    .string()
    .min(1, "Entrez votre prénom")
    .max(50, "Ce prénom est trop long"),
  lastName: z
    .string()
    .min(1, "Entrez votre nom")
    .max(50, "Ce nom est trop long"),
  email: z.string().trim().email("Entrez une adresse courriel valide"),
  password: z
    .string()
    .min(8, "Le mot de passe doit contenir au moins 8 caractères")
    .regex(/[A-Z]/, "Ajoutez au moins une majuscule")
    .regex(/[0-9]/, "Ajoutez au moins un chiffre"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type JoinInput = z.infer<typeof joinSchema>;
