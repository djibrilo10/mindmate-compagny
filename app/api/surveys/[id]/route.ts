import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";

// PATCH  { status: "OPEN" | "CLOSED" } -> fermer / rouvrir un sondage.
// DELETE                               -> supprimer le sondage et toutes ses réponses.
// Réservé aux admins (principal ou co-admins), voir AUDIT.md 7.23.

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const status = body?.status;
    if (status !== "OPEN" && status !== "CLOSED") {
      return Response.json({ error: "Statut invalide" }, { status: 400 });
    }

    const survey = await prisma.survey.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, title: true, closesAt: true },
    });
    if (!survey) {
      return Response.json({ error: "Sondage introuvable" }, { status: 404 });
    }

    // Rouvrir un sondage dont la date de clôture est passée : on retire la
    // date, sinon il resterait fermé en pratique (voir isSurveyOpen).
    const reopeningExpired =
      status === "OPEN" && survey.closesAt !== null && survey.closesAt.getTime() <= Date.now();

    await prisma.survey.update({
      where: { id: survey.id },
      data: { status, ...(reopeningExpired ? { closesAt: null } : {}) },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: status === "CLOSED" ? "SURVEY_CLOSED" : "SURVEY_REOPENED",
        targetId: survey.id,
        metadata: { title: survey.title },
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);

    const { id } = await params;
    const survey = await prisma.survey.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, title: true },
    });
    if (!survey) {
      return Response.json({ error: "Sondage introuvable" }, { status: 404 });
    }

    // Questions, choix, participations et réponses suivent (onDelete: Cascade).
    await prisma.survey.delete({ where: { id: survey.id } });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "SURVEY_DELETED",
        targetId: survey.id,
        metadata: { title: survey.title },
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
