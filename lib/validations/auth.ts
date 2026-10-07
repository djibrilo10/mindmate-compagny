import { z } from "zod";
import { looksLikeEmail, normalizePhone } from "@/lib/phone";

// Nettoie une adresse saisie à la connexion (surtout sur téléphone) :
// forme Unicode normale, retrait de TOUS les espaces et caractères invisibles
// (espaces insécables, zero-width, etc.), minuscules. Utilisé côté client
// (loginSchema) ET côté serveur (lib/auth.ts, authorize()).
export function normalizeLoginEmail(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s\u00A0\u200B-\u200D\u2060\uFEFF]/g, "")
    .toLowerCase();
}

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
  // Connexion : on ne revalide PAS le format strict de l'adresse (5 oct. 2026,
  // voir AUDIT.md) — c'est le serveur qui dit si le compte existe. Les claviers
  // mobiles ajoutent des espaces (même au milieu, ex. après « + »), des
  // majuscules ou des caractères Unicode invisibles ; on les nettoie avec
  // normalizeLoginEmail() et on exige seulement la présence d'un « @ ».
  // Depuis AUDIT.md 7.40, ce champ accepte un COURRIEL ou un NUMÉRO DE
  // TÉLÉPHONE (nom de propriété « email » conservé pour ne rien casser) :
  // avec un « @ » -> courriel nettoyé ; sinon -> téléphone normalisé (+1...).
  email: z
    .string()
    .transform(normalizeLoginIdentifier)
    .refine((v) => v.length > 0, "validation.identifierInvalid"),
  password: z.string().min(1, "validation.passwordRequired"),
});

/** Courriel nettoyé, ou téléphone au format +1..., ou "" si illisible. */
export function normalizeLoginIdentifier(value: string): string {
  if (looksLikeEmail(value)) {
    const email = normalizeLoginEmail(value);
    return /^[^@]+@[^@]+$/.test(email) ? email : "";
  }
  return normalizePhone(value) ?? "";
}

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
  // Courriel OU téléphone (au moins un des deux), AUDIT.md 7.40.
  email: z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || z.string().email().safeParse(v).success, "validation.emailInvalid"),
  phone: z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || normalizePhone(v) !== null, "validation.phoneInvalid"),
  password: z
    .string()
    .min(8, "validation.passwordMin")
    .regex(/[A-Z]/, "validation.passwordUppercase")
    .regex(/[0-9]/, "validation.passwordDigit"),
}).refine((v) => v.email !== "" || v.phone !== "", { message: "validation.emailOrPhoneRequired", path: ["phone"] });

// « Mot de passe oublié » (AUDIT.md 7.35). Comme à la connexion, l'adresse
// est nettoyée (claviers mobiles) et l'identifiant d'entreprise est requis,
// car un même courriel peut exister dans deux entreprises différentes.
export const forgotPasswordSchema = z.object({
  organizationSlug: z.string().trim().min(1, "validation.slugRequired"),
  email: z
    .string()
    .transform(normalizeLoginEmail)
    .refine((v) => /^[^@]+@[^@]+$/.test(v), "validation.emailInvalid"),
});

// Nouveau mot de passe : mêmes règles qu'à l'inscription.
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "validation.resetLinkInvalid"),
    password: z
      .string()
      .min(8, "validation.passwordMin")
      .max(200, "validation.passwordMax")
      .regex(/[A-Z]/, "validation.passwordUppercase")
      .regex(/[0-9]/, "validation.passwordDigit"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "validation.passwordMismatch",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type JoinInput = z.infer<typeof joinSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
