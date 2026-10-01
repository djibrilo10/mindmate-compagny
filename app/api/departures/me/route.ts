import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { notifyRoles } from "@/lib/notifications";
import { surveyAnswersSchema } from "@/lib/retention";
import { findCurrentDeparture, parseLastDay } from "@/lib/departures";

// POST /api/departures/me -> l'EMPLOYÉ (ou gérant) connecté (voir AUDIT.md 7.26) :
// - si un admin a déjà enregistré son départ : il remplit le questionnaire ;
// - sinon : il déclare lui-même sa démission (dernier jour + questionnaire).
// Les réponses sont nominatives : les admins les verront avec son nom.
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["EMPLOYEE", "MANAGER"]); // un admin passe par Paramètres (équipe d'administration)

    const body = await request.json().catch(() => null);
    const parsed = surveyAnswersSchema.safeParse(body?.answers);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Réponds à toutes les questions obligatoires" },
        { status: 400 }
      );
    }
    const answers = parsed.data;
    // Loi 25 (AUDIT.md 7.28) : l'avis de confidentialité doit avoir été accepté.
    if (body?.privacyAccepted !== true) {
      return Response.json({ error: "Coche « J'ai compris » dans l'avis de confidentialité" }, { status: 400 });
    }

    const me = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { firstName: true, lastName: true, departmentId: true, hireDate: true },
    });
    if (!me) return Response.json({ error: "Compte introuvable" }, { status: 404 });

    const existing = await findCurrentDeparture(ctx.userId, me.hireDate);
    if (existing && existing.status !== "PENDING_SURVEY") {
      return Response.json({ error: "Ton départ est déjà enregistré." }, { status: 409 });
    }

    const surveyData = {
      primaryReason: answers.primaryReason,
      secondaryReasons: answers.secondaryReasons,
      details: answers.details,
      ratingManager: answers.ratingManager,
      ratingGrowth: answers.ratingGrowth,
      ratingWorkload: answers.ratingWorkload,
      ratingPay: answers.ratingPay,
      ratingAtmosphere: answers.ratingAtmosphere,
      ratingRecognition: answers.ratingRecognition,
      couldBeRetained: answers.couldBeRetained,
      retentionLever: answers.retentionLever ?? null,
      wouldRecommend: answers.wouldRecommend,
      wouldReturn: answers.wouldReturn,
      comment: answers.comment ?? null,
      submittedAt: new Date(),
      privacyNoticeAt: new Date(),
      status: "COMPLETED" as const,
    };

    let departureId: string;
    let declared = false;
    if (existing) {
      // Questionnaire envoyé par un admin.
      const updated = await prisma.departure.updateMany({
        where: { id: existing.id, userId: ctx.userId, status: "PENDING_SURVEY" },
        data: surveyData,
      });
      if (updated.count === 0) return Response.json({ error: "Questionnaire déjà rempli." }, { status: 409 });
      departureId = existing.id;
    } else {
      // Démission déclarée par l'employé lui-même.
      const lastDay = parseLastDay(body?.lastDay);
      if (!lastDay) return Response.json({ error: "Indique ton dernier jour de travail" }, { status: 400 });
      const created = await prisma.departure.create({
        data: {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          type: "RESIGNATION",
          lastDay,
          departmentId: me.departmentId,
          hireDate: me.hireDate,
          ...surveyData,
        },
        select: { id: true },
      });
      departureId = created.id;
      declared = true;
    }

    const name = `${me.firstName} ${me.lastName}`;
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: declared ? "DEPARTURE_DECLARED" : "DEPARTURE_SURVEY_COMPLETED",
        targetId: departureId,
        metadata: { name },
      },
    });

    await notifyRoles(ctx.organizationId, ["ORG_ADMIN"], {
      type: declared ? "DEPARTURE_DECLARED" : "DEPARTURE_SURVEY_COMPLETED",
      title: declared ? "Démission déclarée" : "Questionnaire de départ rempli",
      body: declared ? `${name} a annoncé son départ.` : `${name} a rempli son questionnaire de départ.`,
      link: `/dashboard/retention/${departureId}`,
    });

    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
