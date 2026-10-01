import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPrimaryAdminId } from "@/lib/admins";

// ------------------------------------------------------------
// Confidentialité / Loi 25 (voir AUDIT.md 7.28).
//
// 1. Avis avant toute collecte NOMINATIVE (questionnaire de départ, sondage
//    nominatif) : qui voit les réponses, à quoi elles servent, combien de
//    temps elles sont gardées, à qui s'adresser. L'employé coche
//    « J'ai compris » ; la date est enregistrée (privacyNoticeAt).
// 2. Suppression automatique (purgeExpiredData), lancée chaque nuit par
//    /api/cron/privacy-purge :
//    - départs dont le dernier jour est plus vieux que la durée choisie :
//      supprimés (questionnaire + transition). Avec 6 mois, la vue « 12 mois »
//      de Rétention ne montre plus que 6 mois de départs (choix de l'admin) ;
//    - réponses aux sondages NOMINATIFS plus vieilles que la durée : le lien
//      avec la personne est coupé (participationId = null). Les résultats
//      globaux du sondage restent, sans nom.
// Les sondages anonymes ne contiennent déjà aucun lien avec une personne.
//
// La durée n'a PAS de valeur par défaut : c'est l'admin principal qui la
// choisit dans Paramètres. Tant qu'elle n'est pas choisie, rien n'est
// supprimé et l'avis l'indique aux employés.
// ------------------------------------------------------------

export const RETENTION_OPTIONS = [6, 12, 24, 36, 60] as const;

export function retentionLabel(months: number) {
  return months % 12 === 0 ? `${months / 12} an${months >= 24 ? "s" : ""}` : `${months} mois`;
}

export const privacySettingsSchema = z.object({
  dataRetentionMonths: z
    .number()
    .int()
    .refine((v) => (RETENTION_OPTIONS as readonly number[]).includes(v), "Durée de conservation invalide"),
  privacyOfficerName: z.string().trim().max(120, "Nom trop long").optional().or(z.literal("")),
  privacyOfficerEmail: z
    .string()
    .trim()
    .max(200, "Courriel trop long")
    .email("Courriel invalide")
    .optional()
    .or(z.literal("")),
});

export type PrivacyInfo = {
  organizationName: string;
  retentionMonths: number | null; // null = pas encore choisie par l'admin principal
  retentionLabel: string | null;
  officerName: string;
  officerEmail: string | null;
  officerIsDefault: boolean; // true = personne désignée, on affiche l'admin principal
};

/** Ce qui est affiché aux employés dans l'avis de confidentialité. */
export async function getPrivacyInfo(organizationId: string): Promise<PrivacyInfo> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, dataRetentionMonths: true, privacyOfficerName: true, privacyOfficerEmail: true },
  });
  const months = org?.dataRetentionMonths ?? null;

  let officerName = org?.privacyOfficerName?.trim() || "";
  let officerEmail = org?.privacyOfficerEmail?.trim() || null;
  const officerIsDefault = !officerName;
  if (officerIsDefault) {
    const primaryId = await getPrimaryAdminId(organizationId);
    const primary = primaryId
      ? await prisma.user.findFirst({
          where: { id: primaryId, organizationId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null;
    officerName = primary ? `${primary.firstName} ${primary.lastName}` : ""; // vide = « l'administration » (traduit)
    officerEmail = officerEmail ?? primary?.email ?? null;
  }

  return {
    organizationName: org?.name ?? "l'entreprise",
    retentionMonths: months,
    retentionLabel: months ? retentionLabel(months) : null,
    officerName,
    officerEmail,
    officerIsDefault,
  };
}

/** Date avant laquelle les données d'une organisation doivent disparaître. */
export function retentionCutoff(months: number, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

export type PurgeResult = {
  organizationId: string;
  departuresDeleted: number;
  surveyAnswersAnonymized: number;
};

/** Applique la durée de conservation à UNE organisation. */
export async function purgeOrganization(organizationId: string, months: number): Promise<PurgeResult> {
  const cutoff = retentionCutoff(months);

  const [departures, answers] = await prisma.$transaction([
    prisma.departure.deleteMany({ where: { organizationId, lastDay: { lt: cutoff } } }),
    prisma.surveyAnswer.updateMany({
      where: {
        organizationId,
        participationId: { not: null },
        participation: { createdAt: { lt: cutoff } },
      },
      data: { participationId: null },
    }),
  ]);

  await prisma.organization.update({ where: { id: organizationId }, data: { lastPrivacyPurgeAt: new Date() } });

  // Une ligne dans le journal seulement s'il s'est passé quelque chose
  // (sinon le journal serait rempli d'une entrée vide par nuit).
  if (departures.count > 0 || answers.count > 0) {
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorId: null, // action automatique
        action: "ORGANIZATION_PRIVACY_PURGE",
        metadata: { departures: departures.count, surveyAnswers: answers.count, months },
      },
    });
  }

  return { organizationId, departuresDeleted: departures.count, surveyAnswersAnonymized: answers.count };
}

/** Applique la durée de conservation à TOUTES les organisations (tâche de nuit). */
export async function purgeExpiredData(): Promise<PurgeResult[]> {
  // Seulement les organisations dont l'admin principal a choisi une durée.
  const orgs = await prisma.organization.findMany({
    where: { dataRetentionMonths: { not: null } },
    select: { id: true, dataRetentionMonths: true },
  });
  const results: PurgeResult[] = [];
  for (const org of orgs) {
    if (!org.dataRetentionMonths) continue;
    try {
      results.push(await purgeOrganization(org.id, org.dataRetentionMonths));
    } catch (error) {
      // Une organisation en erreur ne bloque pas les autres.
      console.error("[privacy-purge] échec pour", org.id, error);
    }
  }
  return results;
}
