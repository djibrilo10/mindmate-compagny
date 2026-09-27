import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { notifyUser } from "@/lib/notifications";

const VALID_STATUSES = ["APPROVED", "REJECTED"] as const;
const STATUS_LABELS: Record<string, string> = {
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
};

// PATCH /api/absences/[id] -> un admin/gérant approuve ou rejette une demande
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"]);

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!VALID_STATUSES.includes(status)) {
      return Response.json({ error: "Statut invalide" }, { status: 400 });
    }

    // where combine id ET organizationId : impossible d'approuver/rejeter la
    // demande d'une autre organisation même en devinant son id.
    const result = await prisma.absenceRequest.updateMany({
      where: { id, organizationId: ctx.organizationId },
      data: { status },
    });

    if (result.count === 0) {
      return Response.json({ error: "Demande introuvable" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ABSENCE_STATUS_UPDATED",
        targetId: id,
        metadata: { status },
      },
    });

    const absence = await prisma.absenceRequest.findUnique({ where: { id }, select: { userId: true } });
    if (absence) {
      await notifyUser(ctx.organizationId, absence.userId, {
        type: "ABSENCE_STATUS_UPDATED",
        title: "Ta demande d'absence a été mise à jour",
        body: `Nouveau statut : ${STATUS_LABELS[status] ?? status}`,
        link: "/dashboard/absences",
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
