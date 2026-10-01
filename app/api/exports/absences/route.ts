import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { toCsv } from "@/lib/csv";
import { renderTablePdf } from "@/lib/pdf";
import { getI18n } from "@/lib/i18n/server";
import { approverScope } from "@/lib/leave";
import { leaveTypeLabel } from "@/lib/leave-format";
import type { MessageKey } from "@/lib/i18n/translator";

// GET /api/exports/absences?format=csv|pdf -> historique des congés.
// Mêmes droits que l'onglet « À approuver » (AUDIT.md 7.30) : admins = toute
// l'entreprise ; gérant = son département. Colonnes dans la langue de la
// personne qui exporte (FR/EN, 7.29).
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    const { t, locale, formatDate } = await getI18n();
    const scope = approverScope(ctx);
    if (!scope) return Response.json({ error: t("leave.errors.forbidden") }, { status: 403 });

    const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";
    const en = locale === "en";
    const L = {
      employee: en ? "Employee" : "Employé",
      type: en ? "Type" : "Type",
      start: en ? "Start" : "Début",
      end: en ? "End" : "Fin",
      days: en ? "Days" : "Jours",
      status: en ? "Status" : "Statut",
      comment: en ? "Comment" : "Commentaire",
      createdAt: en ? "Requested on" : "Demandé le",
      title: en ? "Time-off history" : "Historique des congés",
    };
    const COLUMNS = [
      { key: "employee", label: L.employee },
      { key: "type", label: L.type },
      { key: "startDate", label: L.start },
      { key: "endDate", label: L.end },
      { key: "days", label: L.days },
      { key: "status", label: L.status },
      { key: "reason", label: L.comment },
      { key: "createdAt", label: L.createdAt },
    ];
    const PDF_COLUMNS = [
      { key: "employee", label: L.employee, width: 95 },
      { key: "type", label: L.type, width: 80 },
      { key: "startDate", label: L.start, width: 62 },
      { key: "endDate", label: L.end, width: 62 },
      { key: "days", label: L.days, width: 40 },
      { key: "status", label: L.status, width: 70 },
    ];

    const absences = await prisma.absenceRequest.findMany({
      where: scope,
      orderBy: { startDate: "desc" },
      include: { user: { select: { firstName: true, lastName: true } }, leaveType: true },
    });

    const day = (d: Date) => d.toISOString().slice(0, 10);
    const rows = absences.map((a) => ({
      employee: `${a.user.firstName} ${a.user.lastName}`,
      type: leaveTypeLabel(t, a.leaveType),
      startDate: day(a.startDate),
      endDate: day(a.endDate),
      days: a.days == null ? "" : String(a.days).replace(".", en ? "." : ","),
      reason: a.reason,
      status: t(`leave.status.${a.status}` as MessageKey),
      createdAt: day(a.createdAt),
    }));

    if (format === "csv") {
      return new Response(toCsv(rows, COLUMNS), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${en ? "time-off" : "conges"}.csv"`,
        },
      });
    }

    const pdf = await renderTablePdf({
      title: L.title,
      subtitle: `${formatDate(new Date())} — ${absences.length}`,
      columns: PDF_COLUMNS,
      rows,
    });
    // Buffer -> Uint8Array : voir AUDIT.md 7.19 (type BodyInit vérifié par next build).
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${en ? "time-off" : "conges"}.pdf"`,
      },
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
