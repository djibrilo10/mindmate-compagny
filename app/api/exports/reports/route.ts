import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { toCsv } from "@/lib/csv";
import { renderTablePdf } from "@/lib/pdf";

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau",
  SEEN: "Vu",
  IN_PROGRESS: "En cours",
  RESOLVED: "Résolu",
};

const COLUMNS = [
  { key: "title", label: "Titre" },
  { key: "description", label: "Description" },
  { key: "author", label: "Auteur" },
  { key: "status", label: "Statut" },
  { key: "createdAt", label: "Date" },
];

const PDF_COLUMNS = [
  { key: "title", label: "Titre", width: 100 },
  { key: "author", label: "Auteur", width: 90 },
  { key: "status", label: "Statut", width: 65 },
  { key: "createdAt", label: "Date", width: 70 },
];

// GET /api/exports/reports?format=csv|pdf -> export des signalements,
// réservé aux admins/gérants (même visibilité que GET /api/reports).
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN", "SUPER_ADMIN"]); // signalements : admins seulement (AUDIT.md 7.34)

    const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";

    const reports = await prisma.report.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: { submitter: { select: { firstName: true, lastName: true } } },
    });

    // Même règle de confidentialité que la page Signalements : un
    // signalement anonyme masque son auteur, y compris dans cet export.
    const rows = reports.map((r) => ({
      title: r.title,
      description: r.description,
      author: r.isAnonymous ? "Anonyme" : `${r.submitter.firstName} ${r.submitter.lastName}`,
      status: STATUS_LABELS[r.status] ?? r.status,
      createdAt: r.createdAt.toLocaleDateString("fr-CA"),
    }));

    if (format === "csv") {
      return new Response(toCsv(rows, COLUMNS), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="signalements.csv"',
        },
      });
    }

    const pdf = await renderTablePdf({
      title: "Historique des signalements",
      subtitle: `Généré le ${new Date().toLocaleDateString("fr-CA")} — ${reports.length} signalement(s)`,
      columns: PDF_COLUMNS,
      rows,
    });
    // pdfkit renvoie un Buffer Node — voir le même correctif dans
    // app/api/exports/absences/route.ts.
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="signalements.pdf"',
      },
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
