import { z } from "zod";

// Formulaire « Demander une démo » de la page d'accueil (AUDIT.md 7.43).
// Messages = clés de traduction. `website` : champ piège invisible (robots).

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "200+"] as const;

export const demoRequestSchema = z.object({
  name: z.string().trim().min(2, "landing.form.errors.nameRequired").max(100, "landing.form.errors.tooLong"),
  company: z.string().trim().min(2, "landing.form.errors.companyRequired").max(120, "landing.form.errors.tooLong"),
  email: z.string().trim().toLowerCase().email("landing.form.errors.emailInvalid").max(200, "landing.form.errors.tooLong"),
  phone: z.string().trim().max(40, "landing.form.errors.tooLong").default(""),
  companySize: z.enum(COMPANY_SIZES).or(z.literal("")).default(""),
  message: z.string().trim().max(2000, "landing.form.errors.tooLong").default(""),
  website: z.string().default(""),
});
