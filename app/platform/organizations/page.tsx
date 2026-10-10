import { Building2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/platform-guard";
import { OrganizationsTable } from "@/components/platform/OrganizationsTable";

// ------------------------------------------------------------
// Liste de TOUTES les organisations clientes, avec possibilité de
// suspendre/réactiver — voir AUDIT.md 7.20. Réservé au SUPER_ADMIN (garde
// posée dans app/platform/layout.tsx, pas ici : pas besoin de la répéter).
// ------------------------------------------------------------

export default async function PlatformOrganizationsPage() {
  await requirePlatformOwner(); // AUDIT.md 7.50
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: true,
      status: true,
      createdAt: true,
      isDemo: true,
      trialEndsAt: true,
      billingStatus: true,
      billingQuantity: true,
      suspendedReason: true,
      _count: { select: { users: true } },
    },
  });

  // Entreprises internes (contiennent un compte SUPER_ADMIN) : jamais supprimables.
  const internalIds = new Set(
    (await prisma.user.findMany({ where: { role: "SUPER_ADMIN" }, select: { organizationId: true } })).map((u) => u.organizationId)
  );

  const rows = organizations.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    status: org.status,
    createdAt: org.createdAt.toISOString(),
    employeeCount: org._count.users,
    isDemo: org.isDemo,
    trialEndsAt: org.trialEndsAt?.toISOString() ?? null,
    billingStatus: org.billingStatus,
    billingQuantity: org.billingQuantity,
    suspendedReason: org.suspendedReason,
    isInternal: internalIds.has(org.id),
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
            {rows.length} organisation{rows.length > 1 ? "s" : ""} cliente{rows.length > 1 ? "s" : ""}. Chaque nouvelle entreprise a 30 jours d&apos;essai gratuit : tu es prévenu 5 jours avant la fin.
          </p>
        </div>
      </div>

      <div className="animate-fade-in-up stagger-1">
        <OrganizationsTable initialOrganizations={rows} />
      </div>
    </div>
  );
}
