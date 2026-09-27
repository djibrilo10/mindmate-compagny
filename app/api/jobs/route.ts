import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

// POST /api/jobs -> un admin publie un poste ouvert, visible et postulable
// par tous les employés de l'organisation.
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ADMIN_ROLES); // étape 2 : réservé à l'admin

    const body = await request.json();
    const { title, description } = body;

    if (!title?.trim() || !description?.trim()) {
      return Response.json({ error: "Titre et description requis" }, { status: 400 });
    }

    const jobPosting = await prisma.jobPosting.create({
      data: {
        organizationId: ctx.organizationId, // étape 3 : vient du token, jamais du client
        title: title.trim(),
        description: description.trim(),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "JOB_POSTING_CREATED",
        targetId: jobPosting.id,
      },
    });

    return Response.json({ jobPosting }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
