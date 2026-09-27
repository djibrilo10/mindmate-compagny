import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { notifyUser } from "@/lib/notifications";
import type { Role, ApplicationStatus } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];
const VALID_STATUSES: ApplicationStatus[] = ["RECEIVED", "IN_REVIEW", "ACCEPTED", "REJECTED"];
const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Reçue",
  IN_REVIEW: "En révision",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
};

// PATCH /api/jobs/[id]/applications/[applicationId] -> un admin fait
// avancer le statut d'une candidature (reçue -> en révision -> acceptée/refusée).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; applicationId: string }> }
) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ADMIN_ROLES); // étape 2 : réservé à l'admin
    const { id, applicationId } = await params;

    const body = await request.json();
    const { status } = body;

    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "Statut invalide" }, { status: 400 });
    }

    // étape 3 : on vérifie que la candidature appartient bien à un poste de
    // l'organisation de l'admin, via une double vérification (poste + org).
    const application = await prisma.jobApplication.findFirst({
      where: {
        id: applicationId,
        jobPostingId: id,
        jobPosting: { organizationId: ctx.organizationId },
      },
    });
    if (!application) {
      return Response.json({ error: "Candidature introuvable" }, { status: 404 });
    }

    const updated = await prisma.jobApplication.update({
      where: { id: applicationId },
      data: { status },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "JOB_APPLICATION_STATUS_UPDATED",
        targetId: updated.id,
        metadata: { status },
      },
    });

    await notifyUser(ctx.organizationId, updated.applicantId, {
      type: "JOB_APPLICATION_STATUS_UPDATED",
      title: "Ta candidature a été mise à jour",
      body: `Nouveau statut : ${STATUS_LABELS[status] ?? status}`,
      link: "/dashboard/jobs",
    });

    return Response.json({ application: updated });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
