import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError, ForbiddenError } from "@/lib/session-guard";
import { isSurveyOpen, submitResponseSchema } from "@/lib/surveys";

// POST /api/surveys/[id]/responses -> un employé (ou un admin) répond au
// sondage, une seule fois (voir AUDIT.md 7.23).
//
// Anonymat : pour un sondage anonyme, les SurveyAnswer sont créées SANS
// participationId (et sans date) -> aucun lien possible entre une réponse
// et une personne, même en lisant la base. La SurveyParticipation, elle,
// dit seulement "cette personne a déjà répondu".
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (ctx.role === "SUPER_ADMIN") {
      throw new ForbiddenError("Le propriétaire de la plateforme ne répond pas aux sondages");
    }

    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = submitResponseSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 }
      );
    }

    const survey = await prisma.survey.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: { questions: { include: { options: { select: { id: true } } } } },
    });
    if (!survey) {
      return Response.json({ error: "Sondage introuvable" }, { status: 404 });
    }
    if (!isSurveyOpen(survey)) {
      return Response.json({ error: "Ce sondage est fermé" }, { status: 409 });
    }

    // Exactement une réponse par question, et chaque choix doit appartenir
    // à SA question (impossible d'envoyer un optionId d'un autre sondage).
    const answerByQuestion = new Map(parsed.data.answers.map((a) => [a.questionId, a.optionId]));
    if (answerByQuestion.size !== parsed.data.answers.length) {
      return Response.json({ error: "Une question a reçu plusieurs réponses" }, { status: 400 });
    }
    for (const question of survey.questions) {
      const optionId = answerByQuestion.get(question.id);
      if (!optionId) {
        return Response.json({ error: "Répondez à toutes les questions" }, { status: 400 });
      }
      if (!question.options.some((o) => o.id === optionId)) {
        return Response.json({ error: "Choix de réponse invalide" }, { status: 400 });
      }
    }
    if (answerByQuestion.size !== survey.questions.length) {
      return Response.json({ error: "Réponse à une question inconnue" }, { status: 400 });
    }

    try {
      await prisma.$transaction(async (tx) => {
        // La contrainte unique (surveyId, userId) bloque un 2e envoi, même
        // simultané (double clic) : la transaction entière est alors annulée.
        const participation = await tx.surveyParticipation.create({
          data: { organizationId: ctx.organizationId, surveyId: survey.id, userId: ctx.userId },
          select: { id: true },
        });
        await tx.surveyAnswer.createMany({
          data: survey.questions.map((question) => ({
            organizationId: ctx.organizationId,
            surveyId: survey.id,
            questionId: question.id,
            optionId: answerByQuestion.get(question.id)!,
            participationId: survey.isAnonymous ? null : participation.id,
            departmentId: ctx.departmentId,
          })),
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return Response.json({ error: "Tu as déjà répondu à ce sondage" }, { status: 409 });
      }
      throw error;
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
