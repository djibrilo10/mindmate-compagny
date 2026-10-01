import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";

const MANAGEMENT_ROLES: Role[] = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];
const STRICT_ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

function ExportCard({
  title,
  description,
  csvHref,
  pdfHref,
  delay,
}: {
  title: string;
  description: string;
  csvHref: string;
  pdfHref: string;
  delay: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay * 0.04}s` }}
      className="animate-fade-in-up rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg text-[#1C2438]">{title}</h2>
      <p className="mt-1 text-sm text-[#5B6478]">{description}</p>
      <div className="mt-4 flex gap-2">
        <a
          href={csvHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#E2E4E9] px-3 py-1.5 text-sm text-[#1C2438] transition-colors hover:bg-[#F5F6F8]"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.9} />
          Télécharger en CSV
        </a>
        <a
          href={pdfHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#E2E4E9] px-3 py-1.5 text-sm text-[#1C2438] transition-colors hover:bg-[#F5F6F8]"
        >
          <FileText className="h-3.5 w-3.5" strokeWidth={1.9} />
          Télécharger en PDF
        </a>
      </div>
    </div>
  );
}

// Page réservée aux admins/gérants (voir AUDIT.md 7.16) : un simple employé
// est redirigé vers /dashboard, comme pour /dashboard/activity.
export default async function ExportsPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  if (!MANAGEMENT_ROLES.includes(ctx.role)) {
    redirect("/dashboard");
  }

  const isStrictAdmin = STRICT_ADMIN_ROLES.includes(ctx.role);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
          <Download className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Export de rapports
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            Télécharge les données de ton organisation en CSV (tableur) ou en PDF (document
            imprimable).
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ExportCard
          title="Employés"
          description="Liste complète des employés : rôle, département, statut et date d'embauche."
          csvHref="/api/exports/employees?format=csv"
          pdfHref="/api/exports/employees?format=pdf"
          delay={1}
        />
        <ExportCard
          title="Absences"
          description="Historique des demandes d'absence de l'organisation, avec leur statut."
          csvHref="/api/exports/absences?format=csv"
          pdfHref="/api/exports/absences?format=pdf"
          delay={2}
        />
        {isStrictAdmin && (
          <ExportCard
            title="Signalements"
            description="Historique des signalements — les signalements anonymes le restent dans l'export."
            csvHref="/api/exports/reports?format=csv"
            pdfHref="/api/exports/reports?format=pdf"
            delay={3}
          />
        )}
        {isStrictAdmin && (
          <ExportCard
            title="Historique d'activité"
            description="Les 1000 dernières actions de l'organisation (réservé aux admins)."
            csvHref="/api/exports/activity?format=csv"
            pdfHref="/api/exports/activity?format=pdf"
            delay={4}
          />
        )}
      </div>
    </div>
  );
}
