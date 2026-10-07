import { formatPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { toCsv } from "@/lib/csv";
import { teamMembersWhere } from "@/lib/departments";
import { renderTablePdf } from "@/lib/pdf";
import type { Role } from "@prisma/client";

const MANAGEMENT_ROLES: Role[] = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];
const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  ORG_ADMIN: "Admin",
  MANAGER: "Responsable",
  EMPLOYEE: "Employé",
};
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Actif",
  DISABLED: "Désactivé",
};

const COLUMNS = [
  { key: "lastName", label: "Nom" },
  { key: "firstName", label: "Prénom" },
  { key: "email", label: "Courriel" },
  { key: "phone", label: "Téléphone" },
  { key: "role", label: "Rôle" },
  { key: "department", label: "Département" },
  { key: "status", label: "Statut" },
  { key: "hireDate", label: "Date d'embauche" },
];

const PDF_COLUMNS = [
  { key: "lastName", label: "Nom", width: 80 },
  { key: "firstName", label: "Prénom", width: 80 },
  { key: "role", label: "Rôle", width: 65 },
  { key: "department", label: "Département", width: 95 },
  { key: "status", label: "Statut", width: 60 },
  { key: "hireDate", label: "Embauché le", width: 75 },
];

// GET /api/exports/employees?format=csv|pdf -> export de la liste des
// employés, réservé aux admins/gérants (voir AUDIT.md 7.16).
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, MANAGEMENT_ROLES);
    // Responsable : seulement les membres de ses départements (AUDIT.md 7.34).
    const where = teamMembersWhere(ctx) ?? { organizationId: ctx.organizationId, ...VISIBLE_USER };

    const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";

    const employees = await prisma.user.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        hireDate: true,
        department: { select: { name: true } },
      },
    });

    const rows = employees.map((e) => ({
      lastName: e.lastName,
      firstName: e.firstName,
      email: e.email ?? "",
      phone: formatPhone(e.phone),
      role: ROLE_LABELS[e.role] ?? e.role,
      department: e.department?.name ?? "—",
      status: STATUS_LABELS[e.status] ?? e.status,
      hireDate: e.hireDate ? e.hireDate.toLocaleDateString("fr-CA") : "—",
    }));

    if (format === "csv") {
      return new Response(toCsv(rows, COLUMNS), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="employes.csv"',
        },
      });
    }

    const pdf = await renderTablePdf({
      title: "Liste des employés",
      subtitle: `Généré le ${new Date().toLocaleDateString("fr-CA")} — ${employees.length} employé(s)`,
      columns: PDF_COLUMNS,
      rows,
    });
    // pdfkit renvoie un Buffer Node — voir le même correctif dans
    // app/api/exports/absences/route.ts.
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="employes.pdf"',
      },
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
