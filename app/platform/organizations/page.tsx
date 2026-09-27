import { Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { OrganizationsTable } from "@/components/platform/OrganizationsTable";

// ------------------------------------------------------------
// Liste de TOUTES les organisations clientes, avec possibilité de
// suspendre/réactiver — voir AUDIT.md 7.20. Réservé au SUPER_ADMIN (garde
// posée dans app/platform/layout.tsx, pas ici : pas besoin de la répéter).
// ------------------------------------------------------------

export default async function PlatformOrganizationsPage() {
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      status: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
  });

  const rows = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    status: org.status,
    createdAt: org.createdAt.toISOString(),
    employeeCount: org._count.users,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
          <Building2 className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Organisations
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {rows.length} organisation{rows.length > 1 ? "s" : ""} cliente{rows.length > 1 ? "s" : ""}. Suspendez un accès en cas de non-paiement.
          </p>
        </div>
      </div>

      <div className="animate-fade-in-up stagger-1">
        <OrganizationsTable initialOrganizations={rows} />
      </div>
    </div>
  );
}
