import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { Flag } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { ReportForm } from "@/components/dashboard/ReportForm";
import { ReportsList } from "@/components/dashboard/ReportsList";

// Admins seulement (AUDIT.md 7.34) : un signalement peut viser un responsable,
// qui ne doit donc jamais pouvoir le lire.
const CAN_VIEW_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

export default async function ReportsPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const canViewAll = CAN_VIEW_ROLES.includes(ctx.role);

  const reports = canViewAll
    ? await prisma.report.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: "desc" },
        include: {
          submitter: { select: { firstName: true, lastName: true, department: { select: { name: true, color: true } } } },
        },
      })
    : [];

  // Même règle de confidentialité que l'API : un signalement anonyme masque
  // son auteur même pour l'admin/gérant qui consulte la liste.
  const sanitized = reports.map((report) => ({
    id: report.id,
    title: report.title,
    description: report.description,
    status: report.status,
    isAnonymous: report.isAnonymous,
    createdAt: report.createdAt.toISOString(),
    submitter: report.isAnonymous ? null : report.submitter,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F4E7E7] text-[#8A3B3B]">
          <Flag className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Signalements
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {canViewAll
              ? "Signale un problème ou consulte les signalements de ton organisation."
              : "Signale un problème à l'administration — anonymement si tu le souhaites."}
          </p>
        </div>
      </div>

      <div className="mb-8 max-w-xl animate-fade-in-up stagger-1">
        <ReportForm />
      </div>

      {canViewAll && <ReportsList initialReports={sanitized} />}
    </div>
  );
}
