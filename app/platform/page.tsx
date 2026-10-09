import Link from "next/link";
import { Building2, Building, ShieldOff, TrendingUp, Users, type LucideIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { trialInfo } from "@/lib/trial";

// ------------------------------------------------------------
// Vue d'ensemble du SUPER_ADMIN (vous) — voir AUDIT.md 7.20. Ces requêtes
// sont volontairement SANS filtre organizationId : c'est le seul endroit de
// toute l'application où c'est correct de faire ça, précisément parce que
// ce rôle existe pour voir TOUTES les organisations clientes à la fois.
// ------------------------------------------------------------

const RECENT_ORGANIZATIONS_COUNT = 5;

const TINTS = {
  green: "bg-[#E7F3EF] text-[#2F6F5E]",
  amber: "bg-[#FDF3E3] text-[#8A6A1C]",
  blue: "bg-[#E7F0FA] text-[#2A5A8A]",
  red: "bg-[#FDECEC] text-[#8A3B3B]",
} as const;

function StatCard({
  icon: Icon,
  tint = "green",
  label,
  value,
  delay = 0,
}: {
  icon: LucideIcon;
  tint?: keyof typeof TINTS;
  label: string;
  value: number | string;
  delay?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}s` }}
      className="animate-fade-in-up flex items-center gap-3 rounded-xl border border-[#E2E4E9] bg-white p-4 opacity-0"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TINTS[tint]}`}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-semibold text-[#1C2438]">{value}</p>
        <p className="truncate text-xs text-[#5B6478]">{label}</p>
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
}

export default async function PlatformOverviewPage() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalOrganizations, activeOrganizations, suspendedOrganizations, totalEmployees, newThisMonth, recentOrganizations, trials] =
    await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: "ACTIVE" } }),
      prisma.organization.count({ where: { status: "SUSPENDED" } }),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.organization.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.organization.findMany({
        orderBy: { createdAt: "desc" },
        take: RECENT_ORGANIZATIONS_COUNT,
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          status: true,
          createdAt: true,
          _count: { select: { users: true } },
        },
      }),
      // Essais gratuits en cours ou terminés sans décision (AUDIT.md 7.44),
      // ceux qui finissent le plus tôt en premier.
      prisma.organization.findMany({
        where: { isDemo: false, trialEndsAt: { not: null } },
        orderBy: { trialEndsAt: "asc" },
        take: 8,
        select: { id: true, name: true, slug: true, trialEndsAt: true, _count: { select: { users: true } } },
      }),
    ]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
          <TrendingUp className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Vue d&apos;ensemble
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            Ce qui se passe sur l&apos;ensemble des entreprises clientes, en un coup d&apos;œil.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Building2} tint="green" label="Organisations" value={totalOrganizations} delay={0} />
        <StatCard icon={Building} tint="blue" label="Actives" value={activeOrganizations} delay={0.05} />
        <StatCard icon={ShieldOff} tint="red" label="Suspendues" value={suspendedOrganizations} delay={0.1} />
        <StatCard icon={Users} tint="amber" label="Employés (toutes organisations)" value={totalEmployees} delay={0.15} />
      </div>

      <p className="mt-4 animate-fade-in-up text-sm text-[#5B6478]" style={{ animationDelay: "0.2s" }}>
        {newThisMonth === 0
          ? "Aucune nouvelle organisation ce mois-ci."
          : `${newThisMonth} nouvelle${newThisMonth > 1 ? "s" : ""} organisation${newThisMonth > 1 ? "s" : ""} ce mois-ci.`}
      </p>

      {trials.length > 0 && (
        <div className="animate-fade-in-up mt-8 overflow-hidden rounded-xl border border-[#E2E4E9] bg-white" style={{ animationDelay: "0.22s" }}>
          <div className="flex items-center justify-between border-b border-[#E2E4E9] px-5 py-4">
            <h2 className="text-sm font-medium text-[#1C2438]">Essais gratuits</h2>
            <Link href="/platform/organizations" className="text-sm text-[#2F6F5E] hover:underline">
              Gérer
            </Link>
          </div>
          <ul>
            {trials.map((org) => {
              const info = trialInfo(org.trialEndsAt);
              const tone =
                info.state === "ended" ? "bg-[#FDECEC] text-[#8A3B3B]" : info.state === "ending" ? "bg-[#FDF3E3] text-[#8A6A1C]" : "bg-[#E7F3EF] text-[#2F6F5E]";
              const label =
                info.state === "ended"
                  ? "Terminé : à décider"
                  : `${info.daysLeft} jour${(info.daysLeft ?? 0) > 1 ? "s" : ""} restant${(info.daysLeft ?? 0) > 1 ? "s" : ""}`;
              return (
                <li key={org.id} className="flex items-center justify-between gap-4 border-b border-[#F0F1F4] px-5 py-3 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1C2438]">{org.name}</p>
                    <p className="truncate text-xs text-[#5B6478]">
                      {org.slug} · {org._count.users} employé{org._count.users > 1 ? "s" : ""} · fin le {formatDate(org.trialEndsAt!)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div
        className="animate-fade-in-up mt-8 overflow-hidden rounded-xl border border-[#E2E4E9] bg-white"
        style={{ animationDelay: "0.25s" }}
      >
        <div className="flex items-center justify-between border-b border-[#E2E4E9] px-5 py-4">
          <h2 className="text-sm font-medium text-[#1C2438]">Organisations récentes</h2>
          <Link href="/platform/organizations" className="text-sm text-[#2F6F5E] hover:underline">
            Voir toutes
          </Link>
        </div>
        {recentOrganizations.length === 0 ? (
          <p className="px-5 py-6 text-sm text-[#5B6478]">Aucune organisation pour l&apos;instant.</p>
        ) : (
          <ul>
            {recentOrganizations.map((org) => (
              <li
                key={org.id}
                className="flex items-center justify-between gap-4 border-b border-[#F0F1F4] px-5 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#1C2438]">{org.name}</p>
                  <p className="truncate text-xs text-[#5B6478]">
                    {org.slug} · {org._count.users} employé{org._count.users > 1 ? "s" : ""} · créée le {formatDate(org.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    org.status === "SUSPENDED" ? "bg-[#FDECEC] text-[#8A3B3B]" : "bg-[#E7F3EF] text-[#2F6F5E]"
                  }`}
                >
                  {org.status === "SUSPENDED" ? "Suspendue" : "Active"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
