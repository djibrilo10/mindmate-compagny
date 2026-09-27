import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { notifyRoles } from "@/lib/notifications";
import type { Role } from "@prisma/client";

const MANAGER_ROLES: Role[] = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];

// POST /api/absences -> un employé déclare une absence
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth(); // n'importe quel utilisateur connecté peut déclarer une absence

    const body = await request.json();
    const { startDate, endDate, reason } = body;

    if (!startDate || !endDate || !reason?.trim()) {
      return Response.json({ error: "Tous les champs sont requis" }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return Response.json({ error: "Dates invalides" }, { status: 400 });
    }
    if (start > end) {
      return Response.json(
        { error: "La date de fin doit être après la date de début" },
        { status: 400 }
      );
    }

    const absence = await prisma.absenceRequest.create({
      data: {
        organizationId: ctx.organizationId, // <-- vient du token, jamais du client
        userId: ctx.userId,
        startDate: start,
        endDate: end,
        reason: reason.trim(),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ABSENCE_REQUESTED",
        targetId: absence.id,
      },
    });

    // Prévenir les admins/gérants qu'une nouvelle demande attend leur approbation.
    await notifyRoles(ctx.organizationId, MANAGER_ROLES, {
      type: "ABSENCE_REQUESTED",
      title: "Nouvelle demande d'absence",
      body: reason.trim(),
      link: "/dashboard/absences",
    }, ctx.userId);

    return Response.json({ absence }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// GET /api/absences -> un admin/gérant voit toutes les demandes de l'organisation,
// un employé ne voit QUE les siennes (pour suivre le statut de ses propres demandes)
export async function GET() {
  try {
    const ctx = await requireAuth();
    const canManage = MANAGER_ROLES.includes(ctx.role);

    const absences = await prisma.absenceRequest.findMany({
      where: canManage
        ? { organizationId: ctx.organizationId }
        : { organizationId: ctx.organizationId, userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });

    return Response.json({ absences });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
