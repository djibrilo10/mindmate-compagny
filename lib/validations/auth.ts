import { z } from "zod";

// Les messages sont des CLÉS de traduction (lib/i18n/messages, AUDIT.md 7.29) :
// traduites par tx() dans les formulaires et par t() dans les routes API.

export const registerSchema = z.object({
  organizationName: z
    .string()
    .min(2, "validation.orgNameMin")
    .max(100, "validation.orgNameMax"),
  firstName: z
    .string()
    .min(1, "validation.firstNameRequired")
    .max(50, "validation.firstNameMax"),
  lastName: z
    .string()
    .min(1, "validation.lastNameRequired")
    .max(50, "validation.lastNameMax"),
  email: z.string().trim().email("validation.emailInvalid"),
  password: z
    .string()
    .min(8, "validation.passwordMin")
    .regex(/[A-Z]/, "validation.passwordUppercase")
    .regex(/[0-9]/, "validation.passwordDigit"),
});

export const loginSchema = z.object({
  organizationSlug: z.string().min(1, "validation.slugRequired"),
  // .trim() avant .email() : les claviers mobiles (surtout avec l'auto-complétion
  // du domaine, ex. "@gmail.com" suggéré) ajoutent parfois un espace en fin de
  // saisie, invisible à l'œil, qui faisait échouer la validation même pour une
  // adresse par ailleurs correcte (ex. un alias "+admin@..." plus long, donc
  // plus susceptible de déclencher l'auto-complétion) — voir AUDIT.md.
  email: z.string().trim().email("validation.emailInvalid"),
  password: z.string().min(1, "validation.passwordRequired"),
});

// Auto-inscription d'un employé via le code d'invitation de son
// organisation (voir lib/invite-code.ts et AUDIT.md 7.18). Mêmes règles de
// mot de passe que registerSchema, par cohérence.
export const joinSchema = z.object({
  inviteCode: z
    .string()
    .min(1, "validation.inviteCodeRequired"),
  firstName: z
    .string()
    .min(1, "validation.firstNameRequired")
    .max(50, "validation.firstNameMax"),
  lastName: z
    .string()
    .min(1, "validation.lastNameRequired")
    .max(50, "validation.lastNameMax"),
  email: z.string().trim().email("validation.emailInvalid"),
  password: z
    .string()
    .min(8, "validation.passwordMin")
    .regex(/[A-Z]/, "validation.passwordUppercase")
    .regex(/[0-9]/, "validation.passwordDigit"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type JoinInput = z.infer<typeof joinSchema>;
