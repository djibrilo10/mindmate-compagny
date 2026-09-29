import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { createSurveySchema } from "@/lib/surveys";
import { notifyOrganization } from "@/lib/notifications";

// POST /api/surveys -> un admin (principal OU co-admin) crée un sondage pour
// tous les employés (voir AUDIT.md 7.23). Le choix anonyme/nominatif est
// fait ici, une fois pour toutes.
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);

    const body = await request.json().catch(() => null);
    const parsed = createSurveySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 }
      );
    }
    const data = parsed.data;

    const survey = await prisma.survey.create({
      data: {
        organizationId: ctx.organizationId, // vient du token/base, jamais du client
        authorId: ctx.userId,
        title: data.title,
        description: data.description || null,
        isAnonymous: data.isAnonymous,
        closesAt: data.closesAt ? new Date(data.closesAt) : null,
        questions: {
          create: data.questions.map((q, qi) => ({
            position: qi,
            text: q.text,
            options: { create: q.options.map((label, oi) => ({ position: oi, label })) },
          })),
        },
      },
      select: { id: true, title: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "SURVEY_CREATED",
        targetId: survey.id,
        metadata: {
          title: survey.title,
          questions: data.questions.length,
          anonymous: data.isAnonymous,
        },
      },
    });

    await notifyOrganization(
      ctx.organizationId,
      {
        type: "SURVEY_CREATED",
        title: "Nouveau sondage",
        body: `${survey.title}${data.isAnonymous ? " — réponses anonymes" : ""}`,
        link: "/dashboard/surveys",
      },
      ctx.userId
    );

    return Response.json({ survey }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
