import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { VISIBLE_USER } from "@/lib/visibility";
import { getI18n } from "@/lib/i18n/server";
import {
  approverScope,
  calendarPeopleWhere,
  dayKey,
  getBalances,
  getLeaveTypes,
  isLeaveManager,
  leaveYearOf,
  leaveYearRange,
  overlappingAbsences,
  closedDaysFor,
  companyLeavesFor,
  fullClosedDays,
} from "@/lib/leave";
import { formatDays, formatLeaveDates, leaveTypeLabel, LEAVE_STATUS_STYLES as STATUS_STYLES } from "@/lib/leave-format";
import { AbsenceForm } from "@/components/dashboard/AbsenceForm";
import { AbsencesList, type MyLeaveRow } from "@/components/dashboard/AbsencesList";
import { LeaveApprovals, type PendingLeaveRow } from "@/components/dashboard/LeaveApprovals";
import { LeaveBalancesTable, type BalanceEmployee } from "@/components/dashboard/LeaveBalancesTable";
import { CompanyLeaves, type CompanyLeaveRow } from "@/components/dashboard/CompanyLeaves";

// ------------------------------------------------------------
// Congés et absences (voir AUDIT.md 7.30). Onglets (?tab=) :
// - mine      : soldes, nouvelle demande, mes demandes (tout le monde) ;
// - approvals : demandes à approuver (admins : tout ; gérant : son département) ;
// - calendar  : calendrier mensuel (?month=AAAA-MM) des absences approuvées et
//               en attente — admins : toute l'entreprise ; autres : leur
//               département. Les collègues voient « Absent(e) », jamais le type ;
// - balances  : soldes de tous les employés + ajustements (admins, ?year=).
// ------------------------------------------------------------

type Tab = "mine" | "approvals" | "calendar" | "balances";

export default async function AbsencesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string; year?: string }>;
}) {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const i18n = await getI18n();
  const { t, formatDate } = i18n;
  const params = await searchParams;

  const isAdmin = ctx.role === "ORG_ADMIN";
  const isManager = isLeaveManager(ctx);
  const tabs: Tab[] = ["mine", ...(isManager ? (["approvals"] as Tab[]) : []), "calendar", ...(isAdmin ? (["balances"] as Tab[]) : [])];
  const tab: Tab = tabs.includes(params.tab as Tab) ? (params.tab as Tab) : "mine";

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { leaveYearStartMonth: true },
  });
  const startMonth = org?.leaveYearStartMonth ?? 1;
  const types = await getLeaveTypes(ctx.organizationId);
  const typeById = new Map(types.map((x) => [x.id, x]));
  const label = (type: { code: string | null; name: string | null } | null | undefined) => leaveTypeLabel(t, type);
  const colorOf = (id: string | null) => (id ? typeById.get(id)?.color : undefined) ?? "#9AA1B2";
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
  const currentYear = leaveYearOf(today, startMonth);
  const yearRangeLabel = (year: number) => {
    const { from, to } = leaveYearRange(year, startMonth);
    const end = new Date(to.getTime() - 86_400_000);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
    return `${formatDate(from, opts)} → ${formatDate(end, opts)}`;
  };

  // Compteur affiché sur l'onglet « À approuver ».
  const scope = approverScope(ctx);
  const pendingCount = scope ? await prisma.absenceRequest.count({ where: { AND: [scope, { status: "PENDING" }] } }) : 0;

  let content: ReactNode = null;

  if (tab === "mine") {
    const [balances, mine] = await Promise.all([
      getBalances(ctx.organizationId, [ctx.userId], currentYear, startMonth),
      prisma.absenceRequest.findMany({
        where: { organizationId: ctx.organizationId, userId: ctx.userId },
        orderBy: { startDate: "desc" },
        take: 50,
        include: { leaveType: true },
      }),
    ]);
    const myBalances = balances.get(ctx.userId)!;
    const deciders = await prisma.user.findMany({
      where: { id: { in: mine.map((m) => m.decidedById).filter((x): x is string => !!x) }, organizationId: ctx.organizationId },
      select: { id: true, firstName: true, lastName: true },
    });
    const deciderName = new Map(deciders.map((d) => [d.id, `${d.firstName} ${d.lastName}`]));
    const activeTypes = types.filter((x) => x.isActive);

    const rows: MyLeaveRow[] = mine.map((m) => ({
      id: m.id,
      typeLabel: label(m.leaveType),
      color: colorOf(m.leaveTypeId),
      startDate: m.startDate.toISOString(),
      endDate: m.endDate.toISOString(),
      halfDay: m.halfDay,
      days: m.days,
      status: m.status,
      comment: m.reason,
      decidedByName: m.decidedById ? deciderName.get(m.decidedById) ?? null : null,
      decisionNote: m.decisionNote,
      cancellable: m.status === "PENDING" || (m.status === "APPROVED" && m.startDate > today),
    }));

    // Congés programmés par l'entreprise (7.31) : admins = tous ; autres =
    // ceux de toute l'entreprise ou de leur département. Seulement à venir / en cours.
    const leaveWhere = isAdmin ? { organizationId: ctx.organizationId } : companyLeavesFor(ctx.organizationId, ctx.departmentId);
    const [companyLeaves, departments, closed] = await Promise.all([
      prisma.companyLeave.findMany({
        where: { AND: [leaveWhere, { endDate: { gte: today } }] },
        orderBy: { startDate: "asc" },
        take: 30,
      }),
      isAdmin
        ? prisma.department.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } })
        : Promise.resolve([] as { id: string; name: string }[]),
      closedDaysFor(ctx.organizationId, ctx.departmentId, today, new Date(today.getTime() + 400 * 86_400_000)),
    ]);
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    // Jours de congé offerts par l'entreprise à cette personne pendant l'année
    // de congés en cours (journées entières, du lundi au vendredi). Jamais
    // retirés de ses jours restants : c'est un congé offert (7.32).
    const { from: yearFrom, to: yearTo } = leaveYearRange(currentYear, startMonth);
    const offeredDays = Array.from(
      await closedDaysFor(ctx.organizationId, ctx.departmentId, yearFrom, new Date(yearTo.getTime() - 86_400_000))
    ).filter((key) => {
      const wd = new Date(`${key}T00:00:00Z`).getUTCDay();
      return wd !== 0 && wd !== 6;
    }).length;
    const leaveRows: CompanyLeaveRow[] = companyLeaves.map((l) => ({
      id: l.id,
      title: l.title,
      message: l.message,
      startDate: l.startDate.toISOString(),
      endDate: l.endDate.toISOString(),
      startTime: l.startTime,
      endTime: l.endTime,
      audience: l.departmentIds.length ? l.departmentIds.map((id) => deptName.get(id) ?? "—").join(", ") : null,
      daysUntil: Math.max(0, Math.round((l.startDate.getTime() - today.getTime()) / 86_400_000)),
      ongoing: l.startDate < today && l.endDate >= today,
    }));

    // Disposition voulue par l'utilisateur (7.31) : 2 colonnes — « Demander une
    // absence » | « Congés » — puis « Mes demandes » en dessous, pleine largeur.
    content = (
      <div className="space-y-6">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <AbsenceForm
            closedDays={Array.from(closed)}
            types={activeTypes.map((type) => ({
              id: type.id,
              label: label(type),
              color: type.color,
              available: myBalances.get(type.id)?.available ?? null,
              used: myBalances.get(type.id)?.used ?? 0,
            }))}
          />
          <CompanyLeaves leaves={leaveRows} isAdmin={isAdmin} departments={departments} offeredDays={offeredDays} />
        </div>
        <AbsencesList rows={rows} />
      </div>
    );
  }

  if (tab === "approvals") {
    if (!scope) {
      content = <p className="rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-10 text-center text-sm text-[#5B6478]">{t("leave.approvals.noDepartment")}</p>;
    } else {
      const [pending, recent] = await Promise.all([
        prisma.absenceRequest.findMany({
          where: { AND: [scope, { status: "PENDING" }] },
          orderBy: { startDate: "asc" },
          include: {
            leaveType: true,
            user: { select: { id: true, firstName: true, lastName: true, departmentId: true, department: { select: { name: true } } } },
          },
        }),
        prisma.absenceRequest.findMany({
          where: { AND: [scope, { status: { in: ["APPROVED", "REJECTED"] } }] },
          orderBy: { decidedAt: "desc" },
          take: 15,
          include: { leaveType: true, user: { select: { firstName: true, lastName: true } } },
        }),
      ]);
      // Soldes : par année de congés de chaque demande.
      const balanceCache = new Map<number, Awaited<ReturnType<typeof getBalances>>>();
      const userIds = Array.from(new Set(pending.map((p) => p.userId)));
      for (const year of new Set(pending.map((p) => leaveYearOf(p.startDate, startMonth)))) {
        balanceCache.set(year, await getBalances(ctx.organizationId, userIds, year, startMonth));
      }
      const rows: PendingLeaveRow[] = await Promise.all(
        pending.map(async (p) => {
          const overlaps = await overlappingAbsences(ctx.organizationId, p.user.departmentId, p.userId, p.startDate, p.endDate);
          const b = p.leaveTypeId
            ? balanceCache.get(leaveYearOf(p.startDate, startMonth))?.get(p.userId)?.get(p.leaveTypeId)
            : undefined;
          return {
            id: p.id,
            name: `${p.user.firstName} ${p.user.lastName}`,
            department: p.user.department?.name ?? null,
            typeLabel: label(p.leaveType),
            color: colorOf(p.leaveTypeId),
            startDate: p.startDate.toISOString(),
            endDate: p.endDate.toISOString(),
            halfDay: p.halfDay,
            days: p.days,
            comment: p.reason,
            createdAt: p.createdAt.toISOString(),
            overlapNames: Array.from(new Set(overlaps.map((o) => `${o.user.firstName} ${o.user.lastName}`))),
            balanceAfter: b?.available != null ? Math.round((b.available - (p.days ?? 0)) * 10) / 10 : null,
          };
        })
      );
      content = (
        <div className="space-y-6">
          <LeaveApprovals rows={rows} />
          {recent.length > 0 && (
            <section className="rounded-xl border border-[#E2E4E9] bg-white shadow-sm">
              <h2 className="border-b border-[#E2E4E9] px-5 py-3 text-sm font-medium text-[#1C2438]">{t("leave.approvals.recent")}</h2>
              <ul className="divide-y divide-[#E2E4E9]">
                {recent.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-sm">
                    <span className="font-medium text-[#1C2438]">{r.user.firstName} {r.user.lastName}</span>
                    <span className="text-[#5B6478]">
                      {label(r.leaveType)} · {formatLeaveDates(i18n, r.startDate, r.endDate, r.halfDay)}
                      {r.days != null && ` · ${formatDays(i18n, r.days)}`}
                    </span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[r.status]}`}>
                      {t(`leave.status.${r.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      );
    }
  }

  if (tab === "calendar") {
    const monthMatch = /^(\d{4})-(\d{2})$/.exec(params.month ?? "");
    const y = monthMatch ? Number(monthMatch[1]) : today.getUTCFullYear();
    const m = monthMatch ? Math.min(12, Math.max(1, Number(monthMatch[2]))) - 1 : today.getUTCMonth();
    const first = new Date(Date.UTC(y, m, 1));
    const last = new Date(Date.UTC(y, m + 1, 0));
    const daysInMonth = last.getUTCDate();
    const monthParam = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const prev = monthParam(new Date(Date.UTC(y, m - 1, 1)));
    const next = monthParam(new Date(Date.UTC(y, m + 1, 1)));

    const people = await prisma.user.findMany({
      where: calendarPeopleWhere(ctx),
      select: { id: true, firstName: true, lastName: true, departmentId: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const absences = await prisma.absenceRequest.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: { in: people.map((p) => p.id) },
        status: { in: ["APPROVED", "PENDING"] },
        startDate: { lte: last },
        endDate: { gte: first },
      },
      select: { userId: true, leaveTypeId: true, startDate: true, endDate: true, halfDay: true, status: true },
    });
    // Le type n'est visible que par la personne et ses approbateurs.
    const canSeeType = (person: { id: string; departmentId: string | null }) =>
      person.id === ctx.userId || isAdmin || (ctx.role === "MANAGER" && !!ctx.departmentId && person.departmentId === ctx.departmentId);

    type Cell = { color: string; pending: boolean; half: boolean; title: string };
    const rows = people
      .map((person) => {
        const cells: (Cell | null)[] = Array.from({ length: daysInMonth }, () => null);
        for (const a of absences.filter((x) => x.userId === person.id)) {
          const showType = canSeeType(person);
          const type = a.leaveTypeId ? typeById.get(a.leaveTypeId) : null;
          const title = `${showType ? label(type) : t("leave.calendar.absent")}${a.status === "PENDING" ? ` (${t("leave.calendar.pending")})` : ""}${a.halfDay ? ` · ${t("leave.calendar.halfDay")}` : ""}`;
          for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(Date.UTC(y, m, d));
            if (date >= a.startDate && date <= a.endDate) {
              cells[d - 1] = {
                color: showType ? colorOf(a.leaveTypeId) : "#7C8598",
                pending: a.status === "PENDING",
                half: !!a.halfDay,
                title,
              };
            }
          }
        }
        return { person, cells };
      })
      .filter((r) => r.cells.some(Boolean));

    // Ligne « Congés de l'entreprise » (7.31) : jours couverts par un congé
    // programmé visible par cette personne (plein = journée entière, hachuré = avec heures).
    const monthLeaves = await prisma.companyLeave.findMany({
      where: {
        AND: [
          isAdmin ? { organizationId: ctx.organizationId } : companyLeavesFor(ctx.organizationId, ctx.departmentId),
          { startDate: { lte: last }, endDate: { gte: first } },
        ],
      },
      select: { title: true, startDate: true, endDate: true, startTime: true, endTime: true },
    });
    const fullDays = fullClosedDays(monthLeaves, first, last);
    const companyCells: (string | null)[] = Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(Date.UTC(y, m, i + 1));
      const hit = monthLeaves.filter((l) => date >= l.startDate && date <= l.endDate);
      return hit.length ? hit.map((l) => l.title).join(", ") : null;
    });
    const hasCompanyLeave = companyCells.some(Boolean);

    const monthTitle = formatDate(first, { month: "long", year: "numeric", timeZone: "UTC" });
    const tabLink = (month: string) => `/dashboard/absences?tab=calendar&month=${month}`;
    const todayKey = dayKey(today);

    content = (
      <section className="rounded-xl border border-[#E2E4E9] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E4E9] px-5 py-3">
          <div className="flex items-center gap-1">
            <Link href={tabLink(prev)} aria-label={t("leave.calendar.prev")} className="rounded-md p-1.5 text-[#5B6478] hover:bg-[#F3F5F8]">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <h2 className="min-w-40 text-center font-[family-name:var(--font-display)] text-base capitalize text-[#1C2438]">{monthTitle}</h2>
            <Link href={tabLink(next)} aria-label={t("leave.calendar.next")} className="rounded-md p-1.5 text-[#5B6478] hover:bg-[#F3F5F8]">
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link href={tabLink(monthParam(today))} className="ml-2 rounded-md border border-[#DADEE5] px-2 py-1 text-xs text-[#5B6478] hover:text-[#1C2438]">
              {t("leave.calendar.today")}
            </Link>
          </div>
          <span className="text-xs text-[#9AA1B2]">{isAdmin ? t("leave.calendar.scopeAll") : t("leave.calendar.scopeDepartment")}</span>
        </div>
        {rows.length === 0 && !hasCompanyLeave ? (
          <p className="px-5 py-10 text-center text-sm text-[#9AA1B2]">{t("leave.calendar.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-36 bg-white px-3 py-2 text-left font-medium text-[#5B6478]" />
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const date = new Date(Date.UTC(y, m, i + 1));
                    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
                    const isToday = dayKey(date) === todayKey;
                    return (
                      <th
                        key={i}
                        className={`w-7 min-w-7 px-0 py-2 text-center font-medium ${weekend ? "bg-[#F7F8FA] text-[#B7BECC]" : "text-[#5B6478]"} ${isToday ? "text-[#2F6F5E] underline" : ""}`}
                      >
                        {i + 1}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {hasCompanyLeave && (
                  <tr className="border-t border-[#E2E4E9] bg-[#FFFBF2]">
                    <th scope="row" className="sticky left-0 z-10 truncate bg-[#FFFBF2] px-3 py-1.5 text-left font-medium text-[#8A6A1C]">
                      {t("leave.company.calendarRow")}
                    </th>
                    {companyCells.map((title, i) => {
                      const key = dayKey(new Date(Date.UTC(y, m, i + 1)));
                      return (
                        <td key={i} className="h-8 p-0.5">
                          {title && (
                            <span
                              title={title}
                              className="block h-full w-full rounded"
                              style={{
                                background: fullDays.has(key)
                                  ? "#E0A43A"
                                  : "repeating-linear-gradient(135deg, #E0A43A 0 3px, transparent 3px 6px)",
                              }}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}
                {rows.map(({ person, cells }) => (
                  <tr key={person.id} className="border-t border-[#E2E4E9]">
                    <th scope="row" className="sticky left-0 z-10 truncate bg-white px-3 py-1.5 text-left font-medium text-[#1C2438]">
                      {person.firstName} {person.lastName}
                    </th>
                    {cells.map((cell, i) => {
                      const date = new Date(Date.UTC(y, m, i + 1));
                      const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
                      return (
                        <td key={i} className={`h-8 p-0.5 ${weekend ? "bg-[#F7F8FA]" : ""}`}>
                          {cell && !weekend && (
                            <span
                              title={cell.title}
                              className={`block h-full w-full rounded ${cell.pending ? "border border-dashed opacity-50" : ""}`}
                              style={{
                                background: cell.half ? `linear-gradient(135deg, ${cell.color} 50%, transparent 50%)` : cell.color,
                                borderColor: cell.color,
                              }}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#E2E4E9] px-5 py-3 text-xs text-[#5B6478]">
          {types.filter((x) => x.isActive).map((type) => (
            <span key={type.id} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: type.color }} aria-hidden /> {label(type)}
            </span>
          ))}
          {!isAdmin && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#7C8598]" aria-hidden /> {t("leave.calendar.absent")}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-[#7C8598] opacity-50" aria-hidden /> {t("leave.calendar.pending")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#E0A43A]" aria-hidden /> {t("leave.company.calendarRow")}
          </span>
          <p className="flex basis-full items-start gap-1.5 pt-1 text-[#9AA1B2]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t("leave.calendar.privacyHint")}
          </p>
        </div>
      </section>
    );
  }

  if (tab === "balances" && isAdmin) {
    const year = Number.isInteger(Number(params.year)) && Number(params.year) > 2000 ? Number(params.year) : currentYear;
    // Tous les types actifs : jours restants (avec limite) ou jours pris (sans limite).
    const tracked = types.filter((x) => x.isActive);
    const employees = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, status: "ACTIVE", ...VISIBLE_USER },
      select: { id: true, firstName: true, lastName: true, department: { select: { name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const [balances, adjustments] = await Promise.all([
      getBalances(ctx.organizationId, employees.map((e) => e.id), year, startMonth),
      prisma.leaveBalanceAdjustment.findMany({
        where: { organizationId: ctx.organizationId, year },
        orderBy: { createdAt: "desc" },
        include: { leaveType: true },
      }),
    ]);
    const rows: BalanceEmployee[] = employees.map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      department: e.department?.name ?? null,
      balances: Object.fromEntries(
        tracked.map((type) => {
          const b = balances.get(e.id)?.get(type.id);
          return [type.id, { available: b?.available ?? null, pending: b?.pending ?? 0, used: b?.used ?? 0 }];
        })
      ),
      adjustments: adjustments
        .filter((a) => a.userId === e.id)
        .map((a) => ({ id: a.id, typeLabel: label(a.leaveType), days: a.days, note: a.note, createdAt: a.createdAt.toISOString() })),
    }));
    const yearLink = (yy: number) => `/dashboard/absences?tab=balances&year=${yy}`;
    content = (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-2xl text-sm text-[#5B6478]">{t("leave.balancesAdmin.description")}</p>
          <div className="flex items-center gap-1 text-sm">
            <Link href={yearLink(year - 1)} aria-label={t("leave.balancesAdmin.previousYear")} className="rounded-md p-1.5 text-[#5B6478] hover:bg-white">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="font-medium text-[#1C2438]">{yearRangeLabel(year)}</span>
            <Link href={yearLink(year + 1)} aria-label={t("leave.balancesAdmin.nextYear")} className="rounded-md p-1.5 text-[#5B6478] hover:bg-white">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <LeaveBalancesTable
          year={year}
          types={tracked.map((type) => ({ id: type.id, label: label(type), color: type.color }))}
          employees={rows}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF4E0] text-[#8A6A1C]">
          <CalendarDays className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">{t("leave.title")}</h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">{isManager ? t("leave.subtitleManager") : t("leave.subtitleEmployee")}</p>
        </div>
      </div>

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-[#E2E4E9]" aria-label={t("leave.title")}>
        {tabs.map((key) => (
          <Link
            key={key}
            href={`/dashboard/absences?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === key ? "border-[#2F6F5E] text-[#2F6F5E]" : "border-transparent text-[#5B6478] hover:text-[#1C2438]"
            }`}
          >
            {t(`leave.tabs.${key}`)}
            {key === "approvals" && pendingCount > 0 && (
              <span className="rounded-full bg-[#8A3B3B] px-1.5 py-0.5 text-[10px] font-semibold text-white">{pendingCount}</span>
            )}
          </Link>
        ))}
      </nav>

      <div className="animate-fade-in-up">{content}</div>
    </div>
  );
}
