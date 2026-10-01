import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  Info,
  LifeBuoy,
  Lightbulb,
  Star,
  TrendingDown,
  Undo2,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { DEPARTURE_TYPE_LABELS, PERIODS, getRetentionAnalytics, type Period } from "@/lib/retention";
import { RecordDepartureForm } from "@/components/dashboard/RecordDepartureForm";

// ------------------------------------------------------------
// Employee Retention Intelligence (voir AUDIT.md 7.26) — admins seulement.
// Graphiques en HTML/CSS (pas de bibliothèque), même approche que les
// sondages (7.23) : une seule teinte par graphique, la longueur porte la
// valeur, chaque barre a son % et son nombre écrits en texte, infobulle au
// survol. Seule exception : la couleur d'alerte (rouge + icône + libellé)
// pour un département au-dessus de la moyenne.
// ------------------------------------------------------------

const LEAD = "#2F6F5E";
const SOFT = "#A9D2C4";
const ALERT = "#C2542C";

function fmt(n: number) {
  return String(Number.isInteger(n) ? n : n.toFixed(1)).replace(".", ",");
}
function formatDate(date: Date) {
  return date.toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function Card({ title, icon: Icon, children, className = "" }: { title: string; icon: typeof Info; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm ${className}`}>
      <h2 className="mb-4 flex items-center gap-2 font-[family-name:var(--font-display)] text-base text-[#1C2438]">
        <Icon className="h-4 w-4 text-[#5B6478]" strokeWidth={1.9} />
        {title}
      </h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#E2E4E9] bg-white p-4 shadow-sm">
      <p className="text-xs text-[#5B6478]">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#1C2438]">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[#9AA1B2]">{sub}</p>}
    </div>
  );
}

const INSIGHT_STYLE = {
  alert: { icon: AlertTriangle, cls: "bg-[#FDECEC] text-[#7A2E2E]" },
  warn: { icon: Lightbulb, cls: "bg-[#FDF8EC] text-[#5C4A12]" },
  info: { icon: Info, cls: "bg-[#E7F0FA] text-[#234B73]" },
  good: { icon: CheckCircle2, cls: "bg-[#E7F3EF] text-[#265A4C]" },
} as const;

export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  if (ctx.role !== "ORG_ADMIN") redirect("/dashboard");

  const { period: periodParam } = await searchParams;
  const period = (PERIODS as readonly number[]).includes(Number(periodParam)) ? (Number(periodParam) as Period) : 12;

  const [a, users, existingDepartures, departments] = await Promise.all([
    getRetentionAnalytics(ctx.organizationId, period),
    prisma.user.findMany({
      // role limité à EMPLOYEE/MANAGER : exclut déjà le propriétaire (7.24) et les admins.
      where: { organizationId: ctx.organizationId, status: "ACTIVE", role: { in: ["EMPLOYEE", "MANAGER"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, hireDate: true, departmentId: true },
    }),
    prisma.departure.findMany({ where: { organizationId: ctx.organizationId }, select: { userId: true, createdAt: true } }),
    prisma.department.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, name: true } }),
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  // Candidats : employés actifs sans départ déjà en cours (voir lib/departures.ts).
  const candidates = users
    .filter((u) => !existingDepartures.some((d) => d.userId === u.id && (!u.hireDate || d.createdAt >= u.hireDate)))
    .map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      department: u.departmentId ? deptName.get(u.departmentId) ?? null : null,
    }));

  const t = a.totals;
  const maxMonthly = Math.max(1, ...a.monthly.map((m) => m.count));
  const maxDeptRate = Math.max(1, t.orgRate, ...a.departments.map((d) => d.rate));

  return (
    <div>
      {/* En-tête */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDECEC] text-[#8A3B3B]">
            <TrendingDown className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">Employee Retention Intelligence</h1>
            <p className="mt-0.5 text-sm text-[#5B6478]">Pourquoi vos employés partent, et où agir en priorité.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-[#E2E4E9] bg-white p-0.5 text-sm">
            {PERIODS.map((p) => (
              <Link
                key={p}
                href={`/dashboard/retention?period=${p}`}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  p === period ? "bg-[#2F6F5E] text-white" : "text-[#5B6478] hover:text-[#1C2438]"
                }`}
              >
                {p} mois
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6 animate-fade-in-up stagger-1 flex justify-end">
        <RecordDepartureForm candidates={candidates} />
      </div>

      {/* Chiffres clés */}
      <div className="grid grid-cols-2 gap-3 animate-fade-in-up stagger-2 lg:grid-cols-5">
        <Kpi label={`Départs (${period} derniers mois)`} value={String(t.departures)} sub={`dont ${fmt(t.voluntaryPercent)} % de démissions`} />
        <Kpi label="Taux de départ" value={`${fmt(t.orgRate)} %`} sub="de l'effectif sur la période" />
        <Kpi
          label="Ancienneté moyenne au départ"
          value={t.avgTenureMonths !== null ? `${fmt(t.avgTenureMonths)} mois` : "—"}
          sub={t.avgTenureMonths !== null ? `${fmt(t.earlyLeaversPercent)} % partent avant 1 an` : undefined}
        />
        <Kpi label="Auraient pu être retenus" value={t.completed ? `${fmt(t.retainablePercent)} %` : "—"} sub="réponse « oui » ou « peut-être »" />
        <Kpi label="Questionnaires remplis" value={`${t.completed} / ${t.departures}`} sub={t.pending ? `${t.pending} en attente` : undefined} />
      </div>

      {/* Phrases d'analyse */}
      <Card title="Ce qu'il faut retenir" icon={Lightbulb} className="mt-6 animate-fade-in-up stagger-3">
        <ul className="space-y-2">
          {a.insights.map((ins, i) => {
            const S = INSIGHT_STYLE[ins.tone as keyof typeof INSIGHT_STYLE];
            return (
              <li key={i} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${S.cls}`}>
                <S.icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
                {ins.text}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Raisons */}
        <Card title={`Pourquoi ils partent (${t.completed} questionnaire${t.completed > 1 ? "s" : ""})`} icon={DoorOpen} className="animate-fade-in-up stagger-4">
          {a.reasons.length === 0 ? (
            <p className="text-sm text-[#9AA1B2]">Pas encore de questionnaire rempli sur cette période.</p>
          ) : (
            <>
              <p className="mb-4 text-xs text-[#5B6478]">
                Part des questionnaires qui citent chaque raison (principale ou secondaire) : le total dépasse 100 %.
              </p>
              <ul className="space-y-4">
                {a.reasons.map((r, i) => (
                  <li key={r.code} title={`${r.label} : ${fmt(r.percent)} % (${r.count}) — raison principale pour ${r.primaryCount}`}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className={i === 0 ? "font-semibold text-[#1C2438]" : "text-[#1C2438]"}>{r.label}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className={i === 0 ? "font-semibold text-[#1C2438]" : "text-[#1C2438]"}>{fmt(r.percent)} %</span>
                        <span className="ml-1.5 text-xs text-[#5B6478]">({r.count})</span>
                      </span>
                    </div>
                    <div className="mt-1 h-3 w-full rounded-full bg-[#EEF0F4]">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.percent)}%`, minWidth: 6, backgroundColor: i === 0 ? LEAD : SOFT }} />
                    </div>
                    <p className="mt-1 text-xs text-[#5B6478]">
                      Raison principale pour {r.primaryCount} départ{r.primaryCount > 1 ? "s" : ""}
                      {r.details.length > 0 && (
                        <>
                          {" · dont "}
                          {r.details
                            .slice(0, 3)
                            .map((d) => `${d.label.toLowerCase()} (${fmt(d.percent)} %)`)
                            .join(", ")}
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Départements */}
        <Card title="Taux de départ par département" icon={Building2} className="animate-fade-in-up stagger-5">
          {a.departments.length === 0 ? (
            <p className="text-sm text-[#9AA1B2]">Aucune donnée.</p>
          ) : (
            <>
              <p className="mb-4 flex items-center gap-2 text-xs text-[#5B6478]">
                <span className="inline-block h-3 w-0.5 bg-[#1C2438]" /> Moyenne de l&apos;entreprise : {fmt(t.orgRate)} %
              </p>
              <ul className="space-y-4">
                {a.departments.map((d) => (
                  <li key={d.id ?? "none"} title={`${d.name} : ${fmt(d.rate)} % (${d.departures} départ${d.departures > 1 ? "s" : ""} / ${d.headcount})`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 font-medium text-[#1C2438]">
                        {d.name}
                        {d.isOutlier && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FDECEC] px-2 py-0.5 text-[11px] font-medium text-[#8A3B3B]">
                            <AlertTriangle className="h-3 w-3" /> Au-dessus de la moyenne
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums">
                        <span className="font-semibold text-[#1C2438]">{fmt(d.rate)} %</span>
                        <span className="ml-1.5 text-xs text-[#5B6478]">
                          ({d.departures}/{d.headcount})
                        </span>
                      </span>
                    </div>
                    <div className="relative mt-1 h-3 w-full rounded-full bg-[#EEF0F4]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(d.rate / maxDeptRate) * 100}%`, minWidth: d.departures ? 6 : 0, backgroundColor: d.isOutlier ? ALERT : SOFT }}
                      />
                      <span className="absolute -top-0.5 h-4 w-0.5 bg-[#1C2438]" style={{ left: `${(t.orgRate / maxDeptRate) * 100}%` }} aria-hidden />
                    </div>
                    {d.topReason && <p className="mt-1 text-xs text-[#5B6478]">Raison principale : {d.topReason.toLowerCase()}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Tendance */}
        <Card title="Départs par mois" icon={CalendarClock} className="animate-fade-in-up stagger-6">
          <div className="flex h-40 items-end gap-1.5">
            {a.monthly.map((m) => (
              <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${m.label} : ${m.count} départ${m.count > 1 ? "s" : ""}`}>
                <span className="text-[11px] tabular-nums text-[#1C2438]">{m.count > 0 ? m.count : ""}</span>
                <div
                  className="w-full rounded-t-md"
                  style={{ height: `${(m.count / maxMonthly) * 100}%`, minHeight: m.count ? 4 : 0, backgroundColor: LEAD }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5 border-t border-[#E2E4E9] pt-1">
            {a.monthly.map((m) => (
              <span key={m.key} className="flex-1 text-center text-[10px] text-[#9AA1B2]">
                {m.label}
              </span>
            ))}
          </div>
        </Card>

        {/* Notes */}
        <Card title="Satisfaction des partants (sur 5)" icon={Star} className="animate-fade-in-up stagger-7">
          {a.ratings.every((r) => r.average === null) ? (
            <p className="text-sm text-[#9AA1B2]">Pas encore de note.</p>
          ) : (
            <ul className="space-y-3">
              {a.ratings.map((r, i) => (
                <li key={r.key} title={`${r.label} : ${r.average ?? "—"} / 5`}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="flex items-center gap-2 text-[#1C2438]">
                      {r.label}
                      {i === 0 && r.average !== null && r.average < 3 && (
                        <span className="rounded-full bg-[#FDF3E3] px-2 py-0.5 text-[11px] font-medium text-[#8A6A1C]">Point faible</span>
                      )}
                    </span>
                    <span className="font-semibold tabular-nums text-[#1C2438]">{r.average !== null ? fmt(r.average) : "—"}</span>
                  </div>
                  <div className="mt-1 h-2.5 w-full rounded-full bg-[#EEF0F4]">
                    <div className="h-full rounded-full" style={{ width: `${((r.average ?? 0) / 5) * 100}%`, backgroundColor: i === 0 ? LEAD : SOFT }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Leviers */}
        <Card title="Ce qui les aurait retenus" icon={LifeBuoy} className="animate-fade-in-up stagger-8">
          {a.levers.length === 0 ? (
            <p className="text-sm text-[#9AA1B2]">Pas encore de réponse.</p>
          ) : (
            <ul className="space-y-3">
              {a.levers.map((l, i) => (
                <li key={l.code} title={`${l.label} : ${fmt(l.percent)} % (${l.count})`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-[#1C2438]">{l.label}</span>
                    <span className="tabular-nums text-[#1C2438]">
                      {fmt(l.percent)} % <span className="text-xs text-[#5B6478]">({l.count})</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 w-full rounded-full bg-[#EEF0F4]">
                    <div className="h-full rounded-full" style={{ width: `${l.percent}%`, backgroundColor: i === 0 ? LEAD : SOFT }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {t.completed > 0 && (
            <p className="mt-4 border-t border-[#E2E4E9] pt-3 text-xs text-[#5B6478]">
              {fmt(t.recommendPercent)} % recommanderaient l&apos;entreprise · {fmt(t.wouldReturnPercent)} % pourraient revenir
            </p>
          )}
        </Card>

        {/* Départs récents */}
        <Card title="Départs récents" icon={ClipboardCheck} className="animate-fade-in-up stagger-9">
          {a.recent.length === 0 ? (
            <p className="text-sm text-[#9AA1B2]">Aucun départ sur cette période.</p>
          ) : (
            <ul className="divide-y divide-[#E2E4E9]">
              {a.recent.map((d) => (
                <li key={d.id}>
                  <Link href={`/dashboard/retention/${d.id}`} className="group flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#1C2438]">
                        {d.name} <span className="font-normal text-[#5B6478]">· {d.department}</span>
                      </p>
                      <p className="text-xs text-[#5B6478]">
                        {DEPARTURE_TYPE_LABELS[d.type]} · {formatDate(d.lastDay)}
                        {d.primaryReason ? ` · ${d.primaryReason}` : ""}
                      </p>
                    </div>
                    {d.closed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F3EF] px-2 py-0.5 text-[11px] font-medium text-[#2F6F5E]">
                        <CheckCircle2 className="h-3 w-3" /> Transition terminée
                      </span>
                    ) : d.transitionPlanned ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F0FA] px-2 py-0.5 text-[11px] font-medium text-[#2A5A8A]">
                        <CalendarClock className="h-3 w-3" /> Transition planifiée
                      </span>
                    ) : !d.confirmed ? (
                      <span className="rounded-full bg-[#FDF3E3] px-2 py-0.5 text-[11px] font-medium text-[#8A6A1C]">À confirmer</span>
                    ) : null}
                    {d.status === "PENDING_SURVEY" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FDF3E3] px-2 py-0.5 text-[11px] font-medium text-[#8A6A1C]">
                        <Clock3 className="h-3 w-3" /> Questionnaire en attente
                      </span>
                    ) : d.status === "NO_SURVEY" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F5F8] px-2 py-0.5 text-[11px] font-medium text-[#5B6478]">
                        <Undo2 className="h-3 w-3" /> Sans questionnaire
                      </span>
                    ) : null}
                    <ArrowRight className="h-3.5 w-3.5 text-[#9AA1B2] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
