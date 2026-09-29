import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";

export default async function DepartmentsPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const departments = await prisma.department.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      _count: { select: { users: { where: VISIBLE_USER } } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF0FB] text-[#2F5FA6]">
          <Building2 className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Départements
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {departments.length} département{departments.length > 1 ? "s" : ""} dans votre
            organisation.
          </p>
        </div>
      </div>

      {departments.length === 0 ? (
        <div className="animate-fade-in-up stagger-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
          <Building2 className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
          <p className="text-sm text-[#5B6478]">Aucun département pour le moment.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {departments.map((department, index) => (
            <div
              key={department.id}
              style={{ animationDelay: `${Math.min(index, 10) * 0.04}s` }}
              className="animate-fade-in-up group rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF0FB] text-[#2F5FA6] transition-transform group-hover:scale-105">
                <Building2 className="h-4 w-4" strokeWidth={1.9} />
              </span>
              <h2 className="mt-3 font-[family-name:var(--font-display)] text-lg text-[#1C2438]">
                {department.name}
              </h2>
              <p className="mt-1 text-sm text-[#5B6478]">
                {department._count.users} employé{department._count.users > 1 ? "s" : ""}
              </p>
              <p className="mt-1 text-xs text-[#9AA1B2]">
                Créé le {new Date(department.createdAt).toLocaleDateString("fr-CA")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
