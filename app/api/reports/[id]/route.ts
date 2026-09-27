import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { notifyUser } from "@/lib/notifications";

const VALID_STATUSES = ["NEW", "SEEN", "IN_PROGRESS", "RESOLVED"] as const;
const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  SEEN: "Vu",
  IN_PROGRESS: "En cours",
  RESOLVED: "Résolu",
};

// PATCH /api/reports/[id] -> un manager/admin change le statut d'un signalement
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"]); // étape 2

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "Statut invalide" }, { status: 400 });
    }

    // étape 3 : le where combine id ET organizationId, donc impossible de
    // modifier le signalement d'une autre organisation même en devinant l'id.
    const result = await prisma.report.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: { status },
    });

    if (result.count === 0) {
      return Response.json({ error: "Signalement introuvable" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "REPORT_STATUS_UPDATED",
        targetId: id,
        metadata: { status },
      },
    });

    // Prévenir l'auteur du signalement (même si c'était anonyme pour les
    // autres : l'auteur sait déjà que c'est le sien, ça ne révèle rien).
    const report = await prisma.report.findUnique({ where: { id }, select: { submitterId: true } });
    if (report) {
      await notifyUser(ctx.organizationId, report.submitterId, {
        type: "REPORT_STATUS_UPDATED",
        title: "Ton signalement a été mis à jour",
        body: `Nouveau statut : ${STATUS_LABELS[status] ?? status}`,
        link: "/dashboard/reports",
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
