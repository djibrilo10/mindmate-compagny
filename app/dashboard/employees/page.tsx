import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";
import { getDepartments, teamMembersWhere } from "@/lib/departments";
import { EmployeesTable } from "@/components/dashboard/EmployeesTable";

// ------------------------------------------------------------
// Employés (AUDIT.md 7.34) :
// - admins : toute l'entreprise ; filtre par département, changement de
//   département (une personne ou plusieurs d'un coup), désactivation ;
// - responsables : seulement les membres des départements qu'ils gèrent,
//   en lecture seule ;
// - employés : pas d'accès (la liste de 500 courriels n'a pas à circuler).
// ------------------------------------------------------------

export default async function EmployeesPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const where = teamMembersWhere(ctx);
  if (!where) redirect("/dashboard");
  const { t } = await getI18n();
  const isAdmin = ctx.role === "ORG_ADMIN";

  const [employees, departments] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        status: true,
        hireDate: true,
        department: { select: { id: true, name: true, color: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    getDepartments(ctx.organizationId),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
          <Users className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">{t("departments.employees.title")}</h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {isAdmin
              ? t("departments.employees.subtitleAdmin", { count: employees.length })
              : t("departments.employees.subtitleManager")}
          </p>
        </div>
      </div>

      {employees.length === 0 ? (
        <div className="animate-fade-in-up stagger-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
          <Users className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
          <p className="text-sm text-[#5B6478]">{t("departments.employees.empty")}</p>
        </div>
      ) : (
        <div className="animate-fade-in-up stagger-1">
          <EmployeesTable
            employees={employees.map((e) => ({ ...e, hireDate: e.hireDate ? e.hireDate.toISOString() : null }))}
            departments={isAdmin ? departments : departments.filter((d) => employees.some((e) => e.department?.id === d.id))}
            canManage={isAdmin}
            currentUserId={ctx.userId}
          />
        </div>
      )}
    </div>
  );
}
