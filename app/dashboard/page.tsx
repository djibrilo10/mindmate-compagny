import Link from "next/link";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  ArrowRight,
  Briefcase,
  CalendarDays,
  FileText,
  Flag,
  Mail,
  Sparkles,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { actionCategory, actionDetail, actionLabel } from "@/lib/activity-log";
import { CategoryIcon } from "@/components/dashboard/CategoryIcon";

// ------------------------------------------------------------
// Tableau de bord (Phase 4) — vue d'ensemble chiffrée.
// Les cartes affichées varient selon le rôle, en suivant EXACTEMENT le
// tableau de permissions de la section 7 de AUDIT.md :
// - MANAGEMENT_ROLES (ORG_ADMIN/MANAGER/SUPER_ADMIN) : Signalements + Absences org.
// - STRICT_ADMIN_ROLES (ORG_ADMIN/SUPER_ADMIN, PAS MANAGER) : Candidatures,
//   Avis (moyenne) et Historique d'activité — comme sur leurs pages dédiées.
// ------------------------------------------------------------

const MANAGEMENT_ROLES: Role[] = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];
const STRICT_ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];
const NEW_HIRE_WINDOW_DAYS = 30;
const RECENT_ANNOUNCEMENTS_COUNT = 3;
const RECENT_JOBS_COUNT = 3;
const RECENT_ACTIVITY_COUNT = 6;

// Teintes douces par carte (passe esthétique, voir AUDIT.md 14) : purement
// décoratif, aucune signification métier — juste pour éviter que 10 cartes
// identiques en vert se ressemblent toutes. Couleurs du design system (8).
const TINTS = {
  green: "bg-[#E7F3EF] text-[#2F6F5E]",
  amber: "bg-[#FDF3E3] text-[#8A6A1C]",
  blue: "bg-[#E7F0FA] text-[#2A5A8A]",
  red: "bg-[#FDECEC] text-[#8A3B3B]",
  purple: "bg-[#F1EDFB] text-[#5B3E9C]",
} as const;

type StatCardProps = {
  icon: LucideIcon;
  tint?: keyof typeof TINTS;
  label: string;
  value: number | string;
  href: string;
  delay?: number;
};

function StatCard({ icon: Icon, tint = "green", label, value, href, delay = 0 }: StatCardProps) {
  return (
    <Link
      href={href}
      style={{ animationDelay: `${delay}s` }}
      className="animate-fade-in-up group flex items-center gap-3 rounded-xl border border-[#E2E4E9] bg-white p-4 opacity-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#2F6F5E]/40 hover:shadow-[0_8px_20px_-6px_rgba(28,36,56,0.12)]"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110 ${TINTS[tint]}`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-semibold text-[#1C2438]">{value}</p>
        <p className="truncate text-xs text-[#5B6478]">{label}</p>
      </div>
    </Link>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
}

export default async function DashboardPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const isManagement = MANAGEMENT_ROLES.includes(ctx.role);
  const isStrictAdmin = STRICT_ADMIN_ROLES.includes(ctx.role);
  const thirtyDaysAgo = new Date(Date.now() - NEW_HIRE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [
    activeEmployees,
    newHiresCount,
    openJobPostings,
    totalDocuments,
    myUnreadMessages,
    myPendingAbsences,
    recentAnnouncements,
    recentOpenJobs,
  ] = await Promise.all([
    prisma.user.count({ where: { organizationId: ctx.organizationId, status: "ACTIVE" } }),
    prisma.user.count({
      where: { organizationId: ctx.organizationId, status: "ACTIVE", hireDate: { gte: thirtyDaysAgo } },
    }),
    prisma.jobPosting.count({ where: { organizationId: ctx.organizationId, status: "OPEN" } }),
    prisma.fileUpload.count({ where: { organizationId: ctx.organizationId } }),
    prisma.message.count({
      where: { organizationId: ctx.organizationId, receiverId: ctx.userId, isRead: false },
    }),
    prisma.absenceRequest.count({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, status: "PENDING" },
    }),
    prisma.announcement.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: RECENT_ANNOUNCEMENTS_COUNT,
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.jobPosting.findMany({
      where: { organizationId: ctx.organizationId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: RECENT_JOBS_COUNT,
      select: { id: true, title: true, createdAt: true },
    }),
  ]);

  // Cartes réservées à ORG_ADMIN/MANAGER/SUPER_ADMIN (même accès que les
  // pages Signalements et Absences elles-mêmes).
  let pendingReports = 0;
  let pendingAbsencesOrg = 0;
  if (isManagement) {
    [pendingReports, pendingAbsencesOrg] = await Promise.all([
      prisma.report.count({
        where: { organizationId: ctx.organizationId, status: { in: ["NEW", "SEEN", "IN_PROGRESS"] } },
      }),
      prisma.absenceRequest.count({ where: { organizationId: ctx.organizationId, status: "PENDING" } }),
    ]);
  }

  // Cartes réservées à ORG_ADMIN/SUPER_ADMIN uniquement (PAS MANAGER) — même
  // restriction que les Candidatures détaillées, les Avis et l'Historique.
  let pendingApplications = 0;
  let reviewsAvg: number | null = null;
  let reviewsCount = 0;
  let recentActivity: {
    id: string;
    action: string;
    createdAt: Date;
    actorName: string | null;
    detail: string | null;
  }[] = [];

  if (isStrictAdmin) {
    const [applicationsCount, reviewsAgg, logs] = await Promise.all([
      prisma.jobApplication.count({
        where: { status: "RECEIVED", jobPosting: { organizationId: ctx.organizationId } },
      }),
      prisma.review.aggregate({
        where: { organizationId: ctx.organizationId },
        _avg: { rating: true },
        _count: true,
      }),
      prisma.auditLog.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { createdAt: "desc" },
        take: RECENT_ACTIVITY_COUNT,
        select: { id: true, action: true, actorId: true, metadata: true, createdAt: true },
      }),
    ]);
    pendingApplications = applicationsCount;
    reviewsAvg = reviewsAgg._avg.rating;
    reviewsCount = reviewsAgg._count;

    // AuditLog.actorId n'a pas de relation Prisma (voir 5.4/7.12 dans
    // AUDIT.md) : on résout les noms via une seule requête groupée.
    const actorIds = Array.from(new Set(logs.map((l) => l.actorId).filter((id): id is string => !!id)));
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds }, organizationId: ctx.organizationId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    recentActivity = logs.map((log) => {
      const actor = log.actorId ? actorById.get(log.actorId) : undefined;
      return {
        id: log.id,
        action: log.action,
        createdAt: log.createdAt,
        actorName: actor ? `${actor.firstName} ${actor.lastName}` : null,
        detail: actionDetail(log.action, log.metadata),
      };
    });
  }

  return (
    <div>
      <div className="mb-6 animate-fade-in-up">
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
          Tableau de bord
        </h1>
        <p className="mt-1 text-sm text-[#5B6478]">
          Vue d&apos;ensemble de {isManagement ? "ton organisation" : "ton espace"}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          icon={Users}
          tint="green"
          label="Employés actifs"
          value={activeEmployees}
          href="/dashboard/employees"
          delay={0.02}
        />
        <StatCard
          icon={Sparkles}
          tint="amber"
          label={`Nouvelles recrues (${NEW_HIRE_WINDOW_DAYS} j)`}
          value={newHiresCount}
          href="/dashboard/new-hires"
          delay={0.06}
        />
        <StatCard
          icon={Briefcase}
          tint="blue"
          label="Postes ouverts"
          value={openJobPostings}
          href="/dashboard/jobs"
          delay={0.1}
        />
        <StatCard
          icon={FileText}
          tint="blue"
          label="Documents partagés"
          value={totalDocuments}
          href="/dashboard/files"
          delay={0.14}
        />
        <StatCard
          icon={Mail}
          tint="purple"
          label="Mes messages non lus"
          value={myUnreadMessages}
          href="/dashboard/messages"
          delay={0.18}
        />
        <StatCard
          icon={CalendarDays}
          tint="amber"
          label="Mes absences en attente"
          value={myPendingAbsences}
          href="/dashboard/absences"
          delay={0.22}
        />
        {isManagement && (
          <StatCard
            icon={Flag}
            tint="red"
            label="Signalements à traiter"
            value={pendingReports}
            href="/dashboard/reports"
            delay={0.26}
          />
        )}
        {isManagement && (
          <StatCard
            icon={CalendarDays}
            tint="amber"
            label="Absences à approuver (org.)"
            value={pendingAbsencesOrg}
            href="/dashboard/absences"
            delay={0.3}
          />
        )}
        {isStrictAdmin && (
          <StatCard
            icon={FileText}
            tint="blue"
            label="Candidatures reçues"
            value={pendingApplications}
            href="/dashboard/jobs"
            delay={0.34}
          />
        )}
        {isStrictAdmin && (
          <StatCard
            icon={Star}
            tint="purple"
            label="Note moyenne des avis"
            value={reviewsCount > 0 && reviewsAvg !== null ? `${reviewsAvg.toFixed(1)} / 5` : "—"}
            href="/dashboard/reviews"
            delay={0.38}
          />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="animate-fade-in-up stagger-6 rounded-xl border border-[#E2E4E9] bg-white p-5 opacity-0 transition-shadow duration-200 hover:shadow-[0_8px_20px_-6px_rgba(28,36,56,0.1)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-base text-[#1C2438]">
              Annonces récentes
            </h2>
            <Link
              href="/dashboard/announcements"
              className="group flex items-center gap-1 text-xs font-medium text-[#2F6F5E] hover:underline"
            >
              Voir tout
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
            </Link>
          </div>
          {recentAnnouncements.length === 0 ? (
            <p className="text-sm text-[#9AA1B2]">Aucune annonce pour le moment.</p>
          ) : (
            <ul className="space-y-3">
              {recentAnnouncements.map((a) => (
                <li key={a.id} className="border-b border-[#E2E4E9] pb-3 last:border-0 last:pb-0">
                  <p className="truncate text-sm font-medium text-[#1C2438]">{a.title}</p>
                  <p className="mt-0.5 text-xs text-[#9AA1B2]">{formatDate(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isManagement ? (
          <div className="animate-fade-in-up stagger-7 rounded-xl border border-[#E2E4E9] bg-white p-5 opacity-0 transition-shadow duration-200 hover:shadow-[0_8px_20px_-6px_rgba(28,36,56,0.1)]">
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-base text-[#1C2438]">
              À traiter
            </h2>
            <ul className="space-y-1">
              <li>
                <Link
                  href="/dashboard/reports"
                  className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-[#F7F8FA]"
                >
                  <span className="flex items-center gap-2 text-[#1C2438]">
                    <Flag className="h-4 w-4 text-[#8A3B3B]" strokeWidth={1.9} />
                    Signalements ouverts
                  </span>
                  <span className="font-semibold text-[#1C2438]">{pendingReports}</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/absences"
                  className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-[#F7F8FA]"
                >
                  <span className="flex items-center gap-2 text-[#1C2438]">
                    <CalendarDays className="h-4 w-4 text-[#8A6A1C]" strokeWidth={1.9} />
                    Absences en attente
                  </span>
                  <span className="font-semibold text-[#1C2438]">{pendingAbsencesOrg}</span>
                </Link>
              </li>
              {isStrictAdmin && (
                <li>
                  <Link
                    href="/dashboard/jobs"
                    className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-[#F7F8FA]"
                  >
                    <span className="flex items-center gap-2 text-[#1C2438]">
                      <FileText className="h-4 w-4 text-[#2A5A8A]" strokeWidth={1.9} />
                      Candidatures reçues
                    </span>
                    <span className="font-semibold text-[#1C2438]">{pendingApplications}</span>
                  </Link>
                </li>
              )}
            </ul>
          </div>
        ) : (
          <div className="animate-fade-in-up stagger-7 rounded-xl border border-[#E2E4E9] bg-white p-5 opacity-0 transition-shadow duration-200 hover:shadow-[0_8px_20px_-6px_rgba(28,36,56,0.1)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-base text-[#1C2438]">
                Postes ouverts
              </h2>
              <Link
                href="/dashboard/jobs"
                className="group flex items-center gap-1 text-xs font-medium text-[#2F6F5E] hover:underline"
              >
                Voir tout
                <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
              </Link>
            </div>
            {recentOpenJobs.length === 0 ? (
              <p className="text-sm text-[#9AA1B2]">Aucun poste ouvert pour le moment.</p>
            ) : (
              <ul className="space-y-3">
                {recentOpenJobs.map((j) => (
                  <li key={j.id} className="border-b border-[#E2E4E9] pb-3 last:border-0 last:pb-0">
                    <p className="truncate text-sm font-medium text-[#1C2438]">{j.title}</p>
                    <p className="mt-0.5 text-xs text-[#9AA1B2]">{formatDate(j.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {isStrictAdmin && (
        <div className="animate-fade-in-up stagger-8 mt-6 rounded-xl border border-[#E2E4E9] bg-white p-5 opacity-0 transition-shadow duration-200 hover:shadow-[0_8px_20px_-6px_rgba(28,36,56,0.1)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-base text-[#1C2438]">
              Activité récente
            </h2>
            <Link
              href="/dashboard/activity"
              className="group flex items-center gap-1 text-xs font-medium text-[#2F6F5E] hover:underline"
            >
              Voir tout l&apos;historique
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-[#9AA1B2]">Aucune activité pour le moment.</p>
          ) : (
            <ul className="space-y-3">
              {recentActivity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start gap-3 border-b border-[#E2E4E9] pb-3 last:border-0 last:pb-0"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F7F8FA] text-[#5B6478]">
                    <CategoryIcon category={actionCategory(entry.action)} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#1C2438]">
                      <span className="font-medium">{entry.actorName ?? "Quelqu'un"}</span>{" "}
                      {actionLabel(entry.action)}
                      {entry.detail ? ` · ${entry.detail}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-[#9AA1B2]">
                      {entry.createdAt.toLocaleString("fr-CA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
