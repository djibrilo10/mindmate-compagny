import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import type { Role, JobPostingStatus } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];
const VALID_STATUSES: JobPostingStatus[] = ["OPEN", "CLOSED"];

// PATCH /api/jobs/[id] -> un admin ouvre ou ferme un poste (ne supprime jamais
// un poste : on garde l'historique des candidatures qui y sont rattachées).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ADMIN_ROLES); // étape 2 : réservé à l'admin
    const { id } = await params;

    const body = await request.json();
    const { status } = body;

    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "Statut invalide" }, { status: 400 });
    }

    // étape 3 : la requête est filtrée par organizationId (jamais fourni par le client)
    const existing = await prisma.jobPosting.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!existing) {
      return Response.json({ error: "Poste introuvable" }, { status: 404 });
    }

    const jobPosting = await prisma.jobPosting.update({
      where: { id },
      data: { status },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: status === "OPEN" ? "JOB_POSTING_REOPENED" : "JOB_POSTING_CLOSED",
        targetId: jobPosting.id,
      },
    });

    return Response.json({ jobPosting });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
