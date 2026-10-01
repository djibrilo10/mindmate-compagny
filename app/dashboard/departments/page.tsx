import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Settings } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";
import { managedDepartmentIds } from "@/lib/departments";
import { DepartmentBadge } from "@/components/dashboard/DepartmentBadge";

// ------------------------------------------------------------
// Départements (AUDIT.md 7.34) : une carte par équipe (badge, nombre de
// personnes, responsables). La liste des MEMBRES n'est visible que par les
// admins (tous les départements) et les responsables (leurs départements).
// La création/modification se fait dans Paramètres (admin principal).
// ------------------------------------------------------------

export default async function DepartmentsPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const { t } = await getI18n();
  const isAdmin = ctx.role === "ORG_ADMIN";
  const managed = new Set(ctx.role === "MANAGER" ? await managedDepartmentIds(ctx.userId) : []);

  const departments = await prisma.department.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      users: {
        where: { ...VISIBLE_USER, status: "ACTIVE" },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      },
      managers: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF0FB] text-[#2F5FA6]">
            <Building2 className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">{t("departments.title")}</h1>
            <p className="mt-0.5 text-sm text-[#5B6478]">{t("departments.subtitle", { count: departments.length })}</p>
          </div>
        </div>
        {isAdmin && (
          <Link
            href="/dashboard/settings#departements"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#DADEE5] px-3 py-2 text-sm font-medium text-[#1C2438] hover:border-[#2F6F5E] hover:text-[#2F6F5E]"
          >
            <Settings className="h-4 w-4" strokeWidth={1.9} /> {t("nav.settings")}
          </Link>
        )}
      </div>

      {departments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
          <Building2 className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
          <p className="text-sm text-[#5B6478]">{t("departments.empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((d, index) => {
            const canSeeMembers = isAdmin || managed.has(d.id);
            return (
              <div
                key={d.id}
                style={{ animationDelay: `${Math.min(index, 10) * 0.04}s`, borderTopColor: d.color }}
                className="animate-fade-in-up rounded-xl border border-t-4 border-[#E2E4E9] bg-white p-5 shadow-sm"
              >
                <DepartmentBadge name={d.name} color={d.color} className="text-sm" />
                <p className="mt-2 text-2xl font-semibold text-[#1C2438]">{d.users.length}</p>
                <p className="text-xs text-[#5B6478]">{t("departments.members", { count: d.users.length })}</p>
                <p className="mt-3 text-xs text-[#9AA1B2]">{t("departments.managers")}</p>
                <p className="text-sm text-[#1C2438]">
                  {d.managers.length
                    ? d.managers.map((m) => `${m.user.firstName} ${m.user.lastName}`).join(", ")
                    : <span className="text-[#9AA1B2]">{t("departments.noManager")}</span>}
                </p>
                {canSeeMembers && d.users.length > 0 && (
                  <details className="mt-3 border-t border-[#E2E4E9] pt-2">
                    <summary className="cursor-pointer text-sm font-medium text-[#2F6F5E]">{t("departments.showMembers")}</summary>
                    <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm text-[#1C2438]">
                      {d.users.map((u) => (
                        <li key={u.id}>
                          {u.firstName} {u.lastName}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
