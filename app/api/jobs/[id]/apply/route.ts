import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { notifyRoles } from "@/lib/notifications";

// POST /api/jobs/[id]/apply -> n'importe quel employé connecté postule à un
// poste ouvert de sa propre organisation (une seule fois par poste).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(); // étape 1 (pas de restriction de rôle : tout le monde peut postuler)
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";

    // étape 3 : le poste doit exister ET appartenir à l'organisation de l'utilisateur
    const jobPosting = await prisma.jobPosting.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!jobPosting) {
      return Response.json({ error: "Poste introuvable" }, { status: 404 });
    }
    if (jobPosting.status !== "OPEN") {
      return Response.json({ error: "Ce poste n'accepte plus de candidatures" }, { status: 400 });
    }

    try {
      const application = await prisma.jobApplication.create({
        data: {
          jobPostingId: id,
          applicantId: ctx.userId,
          message: message || null,
        },
      });

      await prisma.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "JOB_APPLICATION_SUBMITTED",
          targetId: application.id,
        },
      });

      // Seuls ORG_ADMIN/SUPER_ADMIN gèrent les candidatures (le gérant n'y a
      // pas accès, voir le tableau de permissions de AUDIT.md) — cohérent
      // avec qui est notifié.
      await notifyRoles(ctx.organizationId, ["ORG_ADMIN", "SUPER_ADMIN"], {
        type: "JOB_APPLICATION_SUBMITTED",
        title: "Nouvelle candidature",
        body: jobPosting.title,
        link: "/dashboard/jobs",
      }, ctx.userId);

      return Response.json({ application }, { status: 201 });
    } catch (error) {
      // Contrainte unique [jobPostingId, applicantId] : l'employé a déjà postulé.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return Response.json({ error: "Tu as déjà postulé à ce poste" }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
