import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { AbsenceForm } from "@/components/dashboard/AbsenceForm";
import { AbsencesList } from "@/components/dashboard/AbsencesList";

const MANAGER_ROLES: Role[] = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];

export default async function AbsencesPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const canManage = MANAGER_ROLES.includes(ctx.role);

  const absences = await prisma.absenceRequest.findMany({
    where: canManage
      ? { organizationId: ctx.organizationId }
      : { organizationId: ctx.organizationId, userId: ctx.userId },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { firstName: true, lastName: true } },
    },
  });

  const serialized = absences.map((absence) => ({
    id: absence.id,
    startDate: absence.startDate.toISOString(),
    endDate: absence.endDate.toISOString(),
    reason: absence.reason,
    status: absence.status,
    createdAt: absence.createdAt.toISOString(),
    user: absence.user,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF4E0] text-[#8A6A1C]">
          <CalendarDays className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Absences
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {canManage
              ? "Déclare une absence ou gère les demandes de ton organisation."
              : "Déclare une absence et suis le statut de tes demandes."}
          </p>
        </div>
      </div>

      <div className="mb-8 max-w-xl animate-fade-in-up stagger-1">
        <AbsenceForm />
      </div>

      <AbsencesList initialAbsences={serialized} canManage={canManage} />
    </div>
  );
}
