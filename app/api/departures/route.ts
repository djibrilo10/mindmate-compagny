import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { VISIBLE_USER } from "@/lib/visibility";
import { notifyUser } from "@/lib/notifications";
import { DEPARTURE_TYPE_LABELS } from "@/lib/retention";
import { findCurrentDeparture, parseLastDay } from "@/lib/departures";

const TYPES = ["RESIGNATION", "END_OF_CONTRACT", "DISMISSAL", "RETIREMENT", "OTHER"] as const;

// POST /api/departures -> un ADMIN (principal ou co-admin) enregistre le
// départ d'un employé (voir AUDIT.md 7.26). Avec sendSurvey, l'employé est
// notifié et remplit le questionnaire de départ sur /dashboard/departure.
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);

    const body = await request.json().catch(() => null);
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const type = TYPES.includes(body?.type) ? (body.type as (typeof TYPES)[number]) : null;
    const lastDay = parseLastDay(body?.lastDay);
    const sendSurvey = body?.sendSurvey !== false;

    if (!userId) return Response.json({ error: "Choisis l'employé qui part" }, { status: 400 });
    if (!type) return Response.json({ error: "Type de départ invalide" }, { status: 400 });
    if (!lastDay) return Response.json({ error: "Date du dernier jour invalide" }, { status: 400 });

    const employee = await prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId, ...VISIBLE_USER },
      select: { id: true, firstName: true, lastName: true, role: true, departmentId: true, hireDate: true },
    });
    if (!employee) return Response.json({ error: "Employé introuvable" }, { status: 404 });
    if (employee.role === "ORG_ADMIN") {
      return Response.json(
        { error: "Pour un administrateur, retire d'abord ses droits dans Paramètres > Équipe d'administration." },
        { status: 409 }
      );
    }
    if (await findCurrentDeparture(employee.id, employee.hireDate)) {
      return Response.json({ error: "Un départ est déjà enregistré pour cet employé." }, { status: 409 });
    }

    const departure = await prisma.departure.create({
      data: {
        organizationId: ctx.organizationId,
        userId: employee.id,
        recordedById: ctx.userId,
        type,
        status: sendSurvey ? "PENDING_SURVEY" : "NO_SURVEY",
        lastDay,
        departmentId: employee.departmentId,
        hireDate: employee.hireDate,
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "DEPARTURE_RECORDED",
        targetId: departure.id,
        metadata: { name: `${employee.firstName} ${employee.lastName}`, type, survey: sendSurvey },
      },
    });

    if (sendSurvey) {
      await notifyUser(ctx.organizationId, employee.id, {
        type: "DEPARTURE_RECORDED",
        title: "Questionnaire de départ",
        body: `${DEPARTURE_TYPE_LABELS[type]} enregistrée. Prends 3 minutes pour nous dire comment améliorer l'entreprise.`,
        link: "/dashboard/departure",
      });
    }

    return Response.json({ ok: true, departureId: departure.id }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
