import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { requirePrimaryAdmin } from "@/lib/admins";
import { notifyUser } from "@/lib/notifications";
import { MAX_HANDOVER_ITEMS, type HandoverItem } from "@/lib/retention-config";

// ------------------------------------------------------------
// PATCH /api/departures/[id] -> fin d'emploi & transition, réservé à
// l'ADMIN PRINCIPAL (voir AUDIT.md 7.27). Actions :
//  { action: "confirm" }                              confirmer la fin d'emploi
//  { action: "schedule", transitionAt, location,      planifier / modifier le
//    notes, items: string[] }                         rendez-vous de transition
//  { action: "checklist", items: HandoverItem[] }     cocher la liste de remise
//  { action: "close" } / { action: "reopen" }          transition terminée / rouvrir
// Le compte de l'employé n'est jamais désactivé ici (choix de l'utilisateur) :
// l'admin le fait depuis la page Employés.
// ------------------------------------------------------------

function cleanLabels(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const labels = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, 120))
    .filter(Boolean);
  return Array.from(new Set(labels)).slice(0, MAX_HANDOVER_ITEMS);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    await requirePrimaryAdmin(ctx);
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const departure = await prisma.departure.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: {
        id: true,
        userId: true,
        confirmedAt: true,
        handoverItems: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    if (!departure) return Response.json({ error: "Départ introuvable" }, { status: 404 });
    const name = `${departure.user.firstName} ${departure.user.lastName}`;
    const log = (action: string, metadata: Record<string, unknown> = {}) =>
      prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorId: ctx.userId, action, targetId: departure.id, metadata: { name, ...metadata } },
      });

    switch (body?.action) {
      case "confirm": {
        if (departure.confirmedAt) return Response.json({ ok: true });
        await prisma.departure.update({
          where: { id: departure.id },
          data: { confirmedAt: new Date(), confirmedById: ctx.userId },
        });
        await log("DEPARTURE_CONFIRMED");
        await notifyUser(ctx.organizationId, departure.userId, {
          type: "DEPARTURE_CONFIRMED",
          title: "Fin d'emploi confirmée",
          body: "Ton départ a été confirmé par l'administration. Les détails sont dans « Mon départ ».",
          link: "/dashboard/departure",
        });
        return Response.json({ ok: true });
      }

      case "schedule": {
        const at = typeof body.transitionAt === "string" ? new Date(body.transitionAt) : null;
        if (!at || Number.isNaN(at.getTime())) {
          return Response.json({ error: "Date et heure du rendez-vous invalides" }, { status: 400 });
        }
        const location = typeof body.location === "string" ? body.location.trim().slice(0, 200) : "";
        const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
        const labels = cleanLabels(body.items);
        if (!labels) return Response.json({ error: "Liste de remise invalide" }, { status: 400 });

        // On conserve l'état "fait" des éléments déjà présents (même libellé).
        const previous = (Array.isArray(departure.handoverItems) ? departure.handoverItems : []) as HandoverItem[];
        const items: HandoverItem[] = labels.map((label, i) => {
          const old = previous.find((p) => p.label === label);
          return old ? old : { id: `h${Date.now().toString(36)}${i}`, label, done: false, doneAt: null };
        });

        await prisma.departure.update({
          where: { id: departure.id },
          data: {
            transitionAt: at,
            transitionLocation: location || null,
            transitionNotes: notes || null,
            handoverItems: items as unknown as Prisma.InputJsonValue,
            // Planifier la transition vaut confirmation de la fin d'emploi.
            ...(departure.confirmedAt ? {} : { confirmedAt: new Date(), confirmedById: ctx.userId }),
          },
        });
        await log("DEPARTURE_TRANSITION_SCHEDULED", { items: items.length });
        await notifyUser(ctx.organizationId, departure.userId, {
          type: "DEPARTURE_TRANSITION_SCHEDULED",
          title: "Rendez-vous de transition",
          body: "Un rendez-vous a été planifié pour la remise des dossiers, clés et accès. Détails dans « Mon départ ».",
          link: "/dashboard/departure",
        });
        return Response.json({ ok: true });
      }

      case "checklist": {
        if (!Array.isArray(body.items)) return Response.json({ error: "Liste invalide" }, { status: 400 });
        const previous = (Array.isArray(departure.handoverItems) ? departure.handoverItems : []) as HandoverItem[];
        const doneById = new Map<string, boolean>(
          (body.items as unknown[])
            .filter((x): x is { id: string; done: boolean } => !!x && typeof (x as HandoverItem).id === "string")
            .map((x) => [x.id, Boolean(x.done)])
        );
        // Seul l'état "fait" change ici ; les libellés se modifient via "schedule".
        const items = previous.map((item) => {
          const done = doneById.has(item.id) ? doneById.get(item.id)! : item.done;
          return { ...item, done, doneAt: done ? item.doneAt ?? new Date().toISOString() : null };
        });
        await prisma.departure.update({ where: { id: departure.id }, data: { handoverItems: items as unknown as Prisma.InputJsonValue } });
        return Response.json({ ok: true, items });
      }

      case "close":
      case "reopen": {
        const closing = body.action === "close";
        await prisma.departure.update({ where: { id: departure.id }, data: { closedAt: closing ? new Date() : null } });
        await log(closing ? "DEPARTURE_CLOSED" : "DEPARTURE_REOPENED");
        return Response.json({ ok: true });
      }

      default:
        return Response.json({ error: "Action inconnue" }, { status: 400 });
    }
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/departures/[id] -> un admin annule un départ enregistré par
// erreur (ou l'employé finalement reste). Supprime aussi ses réponses.
// Voir AUDIT.md 7.26.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    const { id } = await params;

    const departure = await prisma.departure.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    });
    if (!departure) return Response.json({ error: "Départ introuvable" }, { status: 404 });

    await prisma.departure.delete({ where: { id: departure.id } });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "DEPARTURE_CANCELLED",
        targetId: departure.id,
        metadata: { name: `${departure.user.firstName} ${departure.user.lastName}` },
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
