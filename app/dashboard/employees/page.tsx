import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { EmployeesTable } from "@/components/dashboard/EmployeesTable";

// ------------------------------------------------------------
// Désactiver un compte est réservé à l'admin (pas au gérant) :
// voir la demande d'origine ("suppression d'employé par l'admin").
// ------------------------------------------------------------
const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

export default async function EmployeesPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const canManage = ADMIN_ROLES.includes(ctx.role);

  const employees = await prisma.user.findMany({
    where: { organizationId: ctx.organizationId, ...VISIBLE_USER }, // le propriétaire de la plateforme n'apparaît jamais (7.24)
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      status: true,
      hireDate: true,
      department: { select: { name: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const serialized = employees.map((employee) => ({
    ...employee,
    hireDate: employee.hireDate ? employee.hireDate.toISOString() : null,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
          <Users className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Employés
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {employees.length} employé{employees.length > 1 ? "s" : ""} dans votre organisation.
          </p>
        </div>
      </div>

      {employees.length === 0 ? (
        <div className="animate-fade-in-up stagger-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
          <Users className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
          <p className="text-sm text-[#5B6478]">Aucun employé pour le moment.</p>
        </div>
      ) : (
        <div className="animate-fade-in-up stagger-1">
          <EmployeesTable
            initialEmployees={serialized}
            canManage={canManage}
            currentUserId={ctx.userId}
          />
        </div>
      )}
    </div>
  );
}
