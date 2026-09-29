import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { toCsv } from "@/lib/csv";
import { renderTablePdf } from "@/lib/pdf";
import { actionCategory, actionDetail, actionLabel, CATEGORY_LABELS } from "@/lib/activity-log";
import type { Role } from "@prisma/client";

const STRICT_ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];
const MAX_ENTRIES = 1000;

const COLUMNS = [
  { key: "createdAt", label: "Date" },
  { key: "actor", label: "Acteur" },
  { key: "category", label: "Catégorie" },
  { key: "action", label: "Action" },
  { key: "detail", label: "Détail" },
];

const PDF_COLUMNS = [
  { key: "createdAt", label: "Date", width: 75 },
  { key: "actor", label: "Acteur", width: 90 },
  { key: "action", label: "Action", width: 145 },
  { key: "detail", label: "Détail", width: 95 },
];

// GET /api/exports/activity?format=csv|pdf -> export du journal d'activité,
// réservé à ORG_ADMIN/SUPER_ADMIN (pas MANAGER — même restriction que la
// page Historique elle-même, voir AUDIT.md 7.12).
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, STRICT_ADMIN_ROLES);

    const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";

    // Même pattern de résolution des noms d'acteur que
    // app/dashboard/activity/page.tsx (AuditLog.actorId n'a pas de relation
    // Prisma, voir AUDIT.md 5.4/7.12).
    const logs = await prisma.auditLog.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: MAX_ENTRIES,
      select: { action: true, actorId: true, metadata: true, createdAt: true },
    });

    const actorIds = Array.from(new Set(logs.map((l) => l.actorId).filter((id): id is string => !!id)));
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds }, organizationId: ctx.organizationId, ...VISIBLE_USER },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    const rows = logs.map((log) => {
      const actor = log.actorId ? actorById.get(log.actorId) : undefined;
      return {
        createdAt: log.createdAt.toLocaleString("fr-CA"),
        actor: actor ? `${actor.firstName} ${actor.lastName}` : "—",
        category: CATEGORY_LABELS[actionCategory(log.action)],
        action: actionLabel(log.action),
        detail: actionDetail(log.action, log.metadata) ?? "",
      };
    });

    if (format === "csv") {
      return new Response(toCsv(rows, COLUMNS), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="historique-activite.csv"',
        },
      });
    }

    const pdf = await renderTablePdf({
      title: "Historique d'activité",
      subtitle: `Généré le ${new Date().toLocaleDateString("fr-CA")} — ${logs.length} entrée(s) (max. ${MAX_ENTRIES})`,
      columns: PDF_COLUMNS,
      rows,
    });
    // pdfkit renvoie un Buffer Node — voir le même correctif dans
    // app/api/exports/absences/route.ts.
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="historique-activite.pdf"',
      },
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
