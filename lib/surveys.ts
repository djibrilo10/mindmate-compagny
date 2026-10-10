import { z } from "zod";
import { prisma } from "@/lib/prisma";

// ------------------------------------------------------------
// Sondages (voir AUDIT.md 7.23) : validation, état ouvert/fermé et calcul
// des résultats. Utilisé par les routes /api/surveys, la page
// /dashboard/surveys et le tableau de bord.
// ------------------------------------------------------------

export const MAX_QUESTIONS = 10;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
// En dessous de ce nombre de répondants, la ventilation par département
// d'un sondage ANONYME n'est pas affichée : dans un petit département, on
// pourrait deviner qui a répondu quoi.
export const MIN_GROUP_SIZE = 5;

export const createSurveySchema = z.object({
  title: z.string().trim().min(3, "Le titre doit contenir au moins 3 caractères").max(120, "Titre trop long"),
  description: z.string().trim().max(500, "Description trop longue").optional().or(z.literal("")),
  isAnonymous: z.boolean(),
  closesAt: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), "Date de clôture invalide")
    .refine((v) => !v || new Date(v).getTime() > Date.now(), "La date de clôture doit être dans le futur"),
  questions: z
    .array(
      z.object({
        text: z.string().trim().min(3, "Chaque question doit contenir au moins 3 caractères").max(300, "Question trop longue"),
        options: z
          .array(z.string().trim().min(1, "Un choix de réponse est vide").max(100, "Choix de réponse trop long"))
          .min(MIN_OPTIONS, `Chaque question doit avoir au moins ${MIN_OPTIONS} choix`)
          .max(MAX_OPTIONS, `${MAX_OPTIONS} choix maximum par question`)
          .refine(
            (opts) => new Set(opts.map((o) => o.toLowerCase())).size === opts.length,
            "Deux choix identiques dans la même question"
          ),
      })
    )
    .min(1, "Ajoutez au moins une question")
    .max(MAX_QUESTIONS, `${MAX_QUESTIONS} questions maximum`),
});

export const submitResponseSchema = z.object({
  answers: z
    .array(z.object({ questionId: z.string().min(1), optionId: z.string().min(1) }))
    .min(1, "Aucune réponse"),
});

/** Un sondage accepte des réponses s'il est OPEN et que sa date de clôture n'est pas passée. */
export function isSurveyOpen(survey: { status: string; closesAt: Date | null }): boolean {
  if (survey.status !== "OPEN") return false;
  return !survey.closesAt || survey.closesAt.getTime() > Date.now();
}

/** Employés pouvant répondre : actifs, hors SUPER_ADMIN (propriétaire de la plateforme). */
export function eligibleRespondentsWhere(organizationId: string) {
  return { organizationId, status: "ACTIVE" as const, role: { not: "SUPER_ADMIN" as const } };
}

// ---------------- Résultats ----------------

export type OptionResult = { id: string; label: string; count: number; percent: number };

export type DepartmentBreakdown = {
  departmentId: string | null;
  departmentName: string;
  respondents: number;
  percents: { optionId: string; percent: number; count: number }[];
};

export type QuestionResult = {
  id: string;
  text: string;
  totalAnswers: number;
  options: OptionResult[];
  leadingOptionId: string | null;
  insight: string;
  departments: DepartmentBreakdown[];
  hiddenDepartments: number; // départements masqués (moins de MIN_GROUP_SIZE répondants, sondage anonyme)
};

export type SurveyResults = {
  id: string;
  title: string;
  description: string | null;
  isAnonymous: boolean;
  isOpen: boolean;
  status: string;
  closesAt: Date | null;
  createdAt: Date;
  authorName: string;
  respondents: number;
  eligible: number;
  participationRate: number; // 0-100
  questions: QuestionResult[];
  // Sondage nominatif uniquement : qui a répondu quoi.
  individualResponses: { name: string; department: string | null; answeredAt: Date; answers: Record<string, string> }[] | null;
};

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

/**
 * Phrase d'analyse automatique pour une question : aide l'admin à lire le
 * résultat d'un coup d'œil, sans interpréter le graphique lui-même.
 */
function buildInsight(options: OptionResult[], total: number): string {
  if (total === 0) return "Pas encore de réponse.";
  const sorted = [...options].sort((a, b) => b.count - a.count);
  const [first, second] = sorted;
  if (total < MIN_GROUP_SIZE) {
    return `Seulement ${total} réponse${total > 1 ? "s" : ""} : attendre plus de participation avant de conclure.`;
  }
  if (second && first.count === second.count) {
    return `Égalité entre « ${first.label} » et « ${second.label} » (${first.percent} % chacun) : les avis sont partagés.`;
  }
  if (first.percent >= 66) {
    return `Large majorité : ${first.percent} % ont choisi « ${first.label} ».`;
  }
  if (first.percent > 50) {
    return `Majorité : ${first.percent} % ont choisi « ${first.label} »${second ? `, suivi de « ${second.label} » (${second.percent} %)` : ""}.`;
  }
  if (second && first.percent - second.percent < 10) {
    return `Avis partagés : « ${first.label} » (${first.percent} %) devance de peu « ${second.label} » (${second.percent} %).`;
  }
  return `« ${first.label} » arrive en tête avec ${first.percent} %, sans majorité absolue.`;
}

export async function getSurveyResults(surveyId: string, organizationId: string): Promise<SurveyResults | null> {
  const survey = await prisma.survey.findFirst({
    where: { id: surveyId, organizationId },
    include: {
      author: { select: { firstName: true, lastName: true } },
      questions: {
        orderBy: { position: "asc" },
        include: { options: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!survey) return null;

  const [respondents, eligible, optionCounts, deptCounts, departments] = await Promise.all([
    prisma.surveyParticipation.count({ where: { surveyId } }),
    prisma.user.count({ where: eligibleRespondentsWhere(organizationId) }),
    prisma.surveyAnswer.groupBy({ by: ["optionId"], where: { surveyId }, _count: { _all: true } }),
    prisma.surveyAnswer.groupBy({
      by: ["questionId", "departmentId", "optionId"],
      where: { surveyId },
      _count: { _all: true },
    }),
    prisma.department.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ]);

  const countByOption = new Map<string, number>(optionCounts.map((row) => [row.optionId, row._count._all]));
  const deptName = new Map<string, string>(departments.map((d) => [d.id, d.name]));

  const questions: QuestionResult[] = survey.questions.map((question) => {
    const total = question.options.reduce((sum, o) => sum + (countByOption.get(o.id) ?? 0), 0);
    const options = question.options.map((o) => {
      const count = countByOption.get(o.id) ?? 0;
      return { id: o.id, label: o.label, count, percent: pct(count, total) };
    });
    const leading = total > 0 ? [...options].sort((a, b) => b.count - a.count)[0] : null;
    const isTie = leading ? options.filter((o) => o.count === leading.count).length > 1 : false;

    // Ventilation par département pour CETTE question.
    const byDept = new Map<string | null, Map<string, number>>();
    for (const row of deptCounts) {
      if (row.questionId !== question.id) continue;
      const bucket = byDept.get(row.departmentId) ?? new Map<string, number>();
      bucket.set(row.optionId, (bucket.get(row.optionId) ?? 0) + row._count._all);
      byDept.set(row.departmentId, bucket);
    }
    let hiddenDepartments = 0;
    const deptRows: DepartmentBreakdown[] = [];
    for (const [departmentId, bucket] of byDept) {
      const deptTotal = Array.from(bucket.values()).reduce((a, b) => a + b, 0);
      if (survey.isAnonymous && deptTotal < MIN_GROUP_SIZE) {
        hiddenDepartments++;
        continue;
      }
      deptRows.push({
        departmentId,
        departmentName: departmentId ? deptName.get(departmentId) ?? "Département supprimé" : "Sans département",
        respondents: deptTotal,
        percents: question.options.map((o) => ({
          optionId: o.id,
          count: bucket.get(o.id) ?? 0,
          percent: pct(bucket.get(o.id) ?? 0, deptTotal),
        })),
      });
    }
    // Anti-« soustraction » (AUDIT.md 7.50) : total global − départements
    // visibles = réponses des départements masqués. Si ce reste compte moins
    // de MIN_GROUP_SIZE personnes (ex. un seul employé au Bureau), on masque
    // aussi les plus petits départements visibles jusqu'à ce que le reste soit
    // assez grand pour ne plus désigner personne.
    if (survey.isAnonymous && hiddenDepartments > 0) {
      const visibleTotal = deptRows.reduce((sum, d) => sum + d.respondents, 0);
      let hiddenTotal = total - visibleTotal;
      deptRows.sort((a, b) => a.respondents - b.respondents);
      while (hiddenTotal > 0 && hiddenTotal < MIN_GROUP_SIZE && deptRows.length > 0) {
        hiddenTotal += deptRows.shift()!.respondents;
        hiddenDepartments++;
      }
    }
    deptRows.sort((a, b) => b.respondents - a.respondents);

    return {
      id: question.id,
      text: question.text,
      totalAnswers: total,
      options,
      leadingOptionId: leading && !isTie ? leading.id : null,
      insight: buildInsight(options, total),
      // Une seule ligne = aucune comparaison utile entre départements.
      departments: deptRows.length > 1 ? deptRows : [],
      hiddenDepartments,
    };
  });

  let individualResponses: SurveyResults["individualResponses"] = null;
  if (!survey.isAnonymous) {
    const participations = await prisma.surveyParticipation.findMany({
      where: { surveyId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { firstName: true, lastName: true, department: { select: { name: true } } } },
        answers: { select: { questionId: true, option: { select: { label: true } } } },
      },
    });
    // Réponses dont le lien avec la personne a été coupé par la suppression
    // automatique (Loi 25, AUDIT.md 7.28) : elles restent dans les résultats
    // globaux, mais plus dans la liste nominative.
    individualResponses = participations.filter((p) => p.answers.length > 0).map((p) => ({
      name: `${p.user.firstName} ${p.user.lastName}`,
      department: p.user.department?.name ?? null,
      answeredAt: p.createdAt,
      answers: Object.fromEntries(p.answers.map((a) => [a.questionId, a.option.label])),
    }));
  }

  return {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    isAnonymous: survey.isAnonymous,
    isOpen: isSurveyOpen(survey),
    status: survey.status,
    closesAt: survey.closesAt,
    createdAt: survey.createdAt,
    authorName: `${survey.author.firstName} ${survey.author.lastName}`,
    respondents,
    eligible,
    participationRate: Math.min(100, pct(respondents, eligible)), // plafonné : des répondants ont pu quitter l'entreprise depuis
    questions,
    individualResponses,
  };
}
