import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { notifyUsersLocalized } from "@/lib/notifications";
import { getI18n } from "@/lib/i18n/server";
import { approverScope } from "@/lib/leave";
import { formatLeaveDates, leaveTypeLabel } from "@/lib/leave-format";

// ------------------------------------------------------------
// PATCH /api/absences/[id] { action, note } (voir AUDIT.md 7.30)
// - "approve" | "reject" : admin (toute l'entreprise) ou gérant (son
//   département, jamais ses propres demandes). Refus : note obligatoire.
// - "cancel" : la personne elle-même, si la demande est en attente, ou
//   approuvée et pas encore commencée.
// ------------------------------------------------------------

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    const { t } = await getI18n();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const action = body?.action ?? (body?.status === "APPROVED" ? "approve" : body?.status === "REJECTED" ? "reject" : null);
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) : "";

    const include = {
      leaveType: { select: { code: true, name: true } },
      user: { select: { firstName: true, lastName: true } },
    } as const;

    if (action === "cancel") {
      const absence = await prisma.absenceRequest.findFirst({
        where: { id, organizationId: ctx.organizationId, userId: ctx.userId },
        include,
      });
      if (!absence) return Response.json({ error: t("leave.errors.notFound") }, { status: 404 });
      const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
      const cancellable =
        absence.status === "PENDING" || (absence.status === "APPROVED" && absence.startDate > today);
      if (!cancellable) return Response.json({ error: t("leave.errors.cannotCancel") }, { status: 409 });

      await prisma.absenceRequest.update({ where: { id }, data: { status: "CANCELLED" } });
      await prisma.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "ABSENCE_CANCELLED",
          targetId: id,
          metadata: { previousStatus: absence.status },
        },
      });
      // Un congé déjà approuvé : on prévient la personne qui l'avait approuvé.
      if (absence.status === "APPROVED" && absence.decidedById && absence.decidedById !== ctx.userId) {
        await notifyUsersLocalized(ctx.organizationId, [absence.decidedById], (tt, i18n) => ({
          type: "ABSENCE_CANCELLED",
          title: tt("leave.notif.cancelledTitle"),
          body: tt("leave.notif.cancelledBody", {
            name: `${absence.user.firstName} ${absence.user.lastName}`,
            type: leaveTypeLabel(tt, absence.leaveType),
            dates: formatLeaveDates(i18n, absence.startDate, absence.endDate, absence.halfDay),
          }),
          link: "/dashboard/absences?tab=calendar",
        }));
      }
      return Response.json({ ok: true });
    }

    if (action !== "approve" && action !== "reject") {
      return Response.json({ error: t("errors.invalidData") }, { status: 400 });
    }
    const scope = approverScope(ctx);
    if (!scope) return Response.json({ error: t("leave.errors.forbidden") }, { status: 403 });

    const absence = await prisma.absenceRequest.findFirst({ where: { AND: [scope, { id }] }, include });
    if (!absence) return Response.json({ error: t("leave.errors.notFound") }, { status: 404 });
    if (absence.status !== "PENDING") return Response.json({ error: t("leave.errors.notPending") }, { status: 409 });
    if (action === "reject" && !note) return Response.json({ error: t("leave.errors.noteRequired") }, { status: 400 });

    const status = action === "approve" ? "APPROVED" : "REJECTED";
    // Condition "encore en attente" dans la mise à jour : deux approbateurs
    // qui cliquent en même temps ne peuvent pas traiter la demande deux fois.
    const updated = await prisma.absenceRequest.updateMany({
      where: { id, organizationId: ctx.organizationId, status: "PENDING" },
      data: { status, decidedById: ctx.userId, decidedAt: new Date(), decisionNote: note || null },
    });
    if (updated.count === 0) return Response.json({ error: t("leave.errors.notPending") }, { status: 409 });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ABSENCE_STATUS_UPDATED",
        targetId: id,
        metadata: { status },
      },
    });

    await notifyUsersLocalized(ctx.organizationId, [absence.userId], (tt, i18n) => {
      const vars = {
        type: leaveTypeLabel(tt, absence.leaveType),
        dates: formatLeaveDates(i18n, absence.startDate, absence.endDate, absence.halfDay),
        note,
      };
      return {
        type: "ABSENCE_STATUS_UPDATED",
        title: tt(status === "APPROVED" ? "leave.notif.approvedTitle" : "leave.notif.rejectedTitle"),
        body: tt(note ? "leave.notif.decidedBodyNote" : "leave.notif.decidedBody", vars),
        link: "/dashboard/absences",
      };
    });

    return Response.json({ ok: true, status });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
