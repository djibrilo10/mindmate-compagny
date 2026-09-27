import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { toCsv } from "@/lib/csv";
import { renderTablePdf } from "@/lib/pdf";
import type { Role } from "@prisma/client";

const MANAGEMENT_ROLES: Role[] = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];
const STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Refusée",
};

const COLUMNS = [
  { key: "employee", label: "Employé" },
  { key: "startDate", label: "Début" },
  { key: "endDate", label: "Fin" },
  { key: "reason", label: "Motif" },
  { key: "status", label: "Statut" },
  { key: "createdAt", label: "Demandé le" },
];

const PDF_COLUMNS = [
  { key: "employee", label: "Employé", width: 100 },
  { key: "startDate", label: "Début", width: 60 },
  { key: "endDate", label: "Fin", width: 60 },
  { key: "reason", label: "Motif", width: 130 },
  { key: "status", label: "Statut", width: 65 },
];

// GET /api/exports/absences?format=csv|pdf -> export de l'historique des
// absences de toute l'organisation, réservé aux admins/gérants (même
// visibilité que GET /api/absences pour un admin/gérant).
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, MANAGEMENT_ROLES);

    const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";

    const absences = await prisma.absenceRequest.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    const rows = absences.map((a) => ({
      employee: `${a.user.firstName} ${a.user.lastName}`,
      startDate: a.startDate.toLocaleDateString("fr-CA"),
      endDate: a.endDate.toLocaleDateString("fr-CA"),
      reason: a.reason,
      status: STATUS_LABELS[a.status] ?? a.status,
      createdAt: a.createdAt.toLocaleDateString("fr-CA"),
    }));

    if (format === "csv") {
      return new Response(toCsv(rows, COLUMNS), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="absences.csv"',
        },
      });
    }

    const pdf = await renderTablePdf({
      title: "Historique des absences",
      subtitle: `Généré le ${new Date().toLocaleDateString("fr-CA")} — ${absences.length} demande(s)`,
      columns: PDF_COLUMNS,
      rows,
    });
    // pdfkit renvoie un Buffer Node — le vrai type BodyInit attendu par Response
    // (vérifié par `next build`, contrairement à `next dev` qui ne fait pas la
    // même vérification de types) ne l'accepte pas tel quel, d'où le passage
    // explicite par Uint8Array (même correctif que GET /api/organization/logo,
    // voir AUDIT.md 7.19).
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="absences.pdf"',
      },
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
