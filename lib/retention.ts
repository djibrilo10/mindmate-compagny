import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import {
  LEVERS,
  RATING_DIMENSIONS,
  RATING_KEYS,
  REASONS,
  REASON_CODES,
  type LeverCode,
  type ReasonCode,
} from "@/lib/retention-config";

export * from "@/lib/retention-config";

// ------------------------------------------------------------
// Employee Retention Intelligence (voir AUDIT.md 7.26).
// Questionnaire : lib/retention-config.ts (ré-exporté ici).
// Ce fichier : le calcul des analyses : raisons, sous-causes, départements,
//    tendance mensuelle, notes, leviers de rétention, phrases d'analyse.
// ------------------------------------------------------------

// ---------- Analyses ----------

export const PERIODS = [3, 6, 12] as const;
export type Period = (typeof PERIODS)[number];
// En dessous de ce nombre de départs, un département n'est pas désigné comme
// "au-dessus de la moyenne" : 1 départ sur 3 personnes = 33 %, ce n'est pas une tendance.
const MIN_DEPARTURES_FOR_OUTLIER = 2;

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

export type RetentionAnalytics = Awaited<ReturnType<typeof getRetentionAnalytics>>;

export async function getRetentionAnalytics(organizationId: string, months: Period) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);

  const [departures, departments, activeUsers] = await Promise.all([
    prisma.departure.findMany({
      where: { organizationId, lastDay: { gte: since } },
      orderBy: { lastDay: "desc" },
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    prisma.department.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.user.groupBy({
      by: ["departmentId"],
      where: { organizationId, status: "ACTIVE", ...VISIBLE_USER },
      _count: { _all: true },
    }),
  ]);

  const deptName = new Map<string, string>(departments.map((d) => [d.id, d.name]));
  const nameOf = (id: string | null) => (id ? deptName.get(id) ?? "Département supprimé" : "Sans département");
  const completed = departures.filter((d) => d.status === "COMPLETED");
  const n = completed.length;

  // --- Chiffres clés ---
  const activeTotal = activeUsers.reduce((s, r) => s + r._count._all, 0);
  // Effectif moyen approximatif sur la période = actifs aujourd'hui + partis
  // pendant la période (ils étaient là au début). Suffisant pour comparer
  // les départements entre eux ; ce n'est pas un calcul de paie.
  const orgRate = pct(departures.length, activeTotal + departures.length);
  const voluntary = departures.filter((d) => d.type === "RESIGNATION").length;
  const tenures = departures
    .filter((d) => d.hireDate)
    .map((d) => (d.lastDay.getTime() - (d.hireDate as Date).getTime()) / (30.44 * 24 * 3600 * 1000));
  const avgTenureMonths = tenures.length ? Math.round((tenures.reduce((a, b) => a + b, 0) / tenures.length) * 10) / 10 : null;
  const earlyLeavers = tenures.filter((m) => m < 12).length;

  // --- Raisons (part des questionnaires qui CITENT la raison : principale ou secondaire) ---
  const reasons = REASON_CODES.map((code) => {
    const citing = completed.filter((d) => d.primaryReason === code || d.secondaryReasons.includes(code));
    const asPrimary = completed.filter((d) => d.primaryReason === code).length;
    const detailCounts = Object.entries(REASONS[code].details)
      .map(([dCode, label]) => ({
        code: dCode,
        label,
        count: citing.filter((d) => d.details.includes(dCode)).length,
      }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((x) => ({ ...x, percent: pct(x.count, citing.length) }));
    return {
      code,
      label: REASONS[code].label,
      count: citing.length,
      percent: pct(citing.length, n),
      primaryCount: asPrimary,
      primaryPercent: pct(asPrimary, n),
      details: detailCounts,
    };
  })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  // --- Départements ---
  const activeByDept = new Map<string | null, number>(activeUsers.map((r) => [r.departmentId, r._count._all]));
  const deptIds = new Set<string | null>([...activeByDept.keys(), ...departures.map((d) => d.departmentId)]);
  const departmentsStats = Array.from(deptIds)
    .map((id) => {
      const left = departures.filter((d) => d.departmentId === id);
      const headcount = (activeByDept.get(id) ?? 0) + left.length;
      const reasonCounts = new Map<string, number>();
      for (const d of left) if (d.primaryReason) reasonCounts.set(d.primaryReason, (reasonCounts.get(d.primaryReason) ?? 0) + 1);
      const topReason = Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1])[0];
      const rate = pct(left.length, headcount);
      return {
        id,
        name: nameOf(id),
        departures: left.length,
        headcount,
        rate,
        topReason: topReason ? REASONS[topReason[0] as ReasonCode]?.label ?? topReason[0] : null,
        isOutlier: left.length >= MIN_DEPARTURES_FOR_OUTLIER && orgRate > 0 && rate >= orgRate * 1.3,
      };
    })
    .filter((d) => d.headcount > 0)
    .sort((a, b) => b.rate - a.rate || b.departures - a.departures);

  // --- Tendance mensuelle ---
  const monthly: { key: string; label: string; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthly.push({
      key,
      label: d.toLocaleDateString("fr-CA", { month: "short" }),
      count: departures.filter((x) => {
        const k = `${x.lastDay.getFullYear()}-${String(x.lastDay.getMonth() + 1).padStart(2, "0")}`;
        return k === key;
      }).length,
    });
  }

  // --- Notes moyennes (1 à 5) ---
  const ratings = RATING_KEYS.map((key) => {
    const values = completed.map((d) => d[key]).filter((v): v is number => typeof v === "number");
    return {
      key,
      label: RATING_DIMENSIONS[key],
      average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null,
    };
  }).sort((a, b) => (a.average ?? 99) - (b.average ?? 99));

  // --- Rétention possible + leviers ---
  const retainable = completed.filter((d) => d.couldBeRetained === "YES" || d.couldBeRetained === "MAYBE");
  const levers = (Object.keys(LEVERS) as LeverCode[])
    .map((code) => ({ code, label: LEVERS[code], count: retainable.filter((d) => d.retentionLever === code).length }))
    .filter((l) => l.count > 0 && l.code !== "NOTHING")
    .sort((a, b) => b.count - a.count)
    .map((l) => ({ ...l, percent: pct(l.count, retainable.length) }));
  const recommend = completed.filter((d) => d.wouldRecommend === "YES").length;
  const wouldReturn = completed.filter((d) => d.wouldReturn === "YES" || d.wouldReturn === "MAYBE").length;

  // --- Phrases d'analyse (les plus importantes d'abord) ---
  const insights: { tone: "alert" | "warn" | "info" | "good"; text: string }[] = [];
  const outliers = departmentsStats.filter((d) => d.isOutlier);
  for (const d of outliers.slice(0, 2)) {
    insights.push({
      tone: "alert",
      text: `Le département ${d.name} présente un taux de départ de ${d.rate} %, contre ${orgRate} % pour l'ensemble de l'entreprise (${(d.rate / orgRate).toFixed(1).replace(".", ",")}×)${d.topReason ? `. Raison principale : ${d.topReason.toLowerCase()}` : ""}.`,
    });
  }
  if (reasons[0] && n >= 3) {
    const top = reasons[0];
    const topDetail = top.details[0];
    insights.push({
      tone: "warn",
      text: `${top.label} est la première cause de départ : citée dans ${top.percent} % des questionnaires${topDetail ? ` (surtout « ${topDetail.label.toLowerCase()} »)` : ""}.`,
    });
  }
  const worst = ratings.find((r) => r.average !== null);
  if (worst && worst.average !== null && worst.average < 3 && n >= 3) {
    insights.push({ tone: "warn", text: `Point le plus mal noté par les partants : ${worst.label.toLowerCase()} (${String(worst.average).replace(".", ",")} / 5).` });
  }
  if (n >= 3 && retainable.length > 0) {
    insights.push({
      tone: "info",
      text: `${pct(retainable.length, n)} % des partants disent qu'on aurait pu (ou peut-être pu) les retenir${levers[0] ? `. Levier le plus cité : ${levers[0].label.toLowerCase()} (${levers[0].percent} %)` : ""}.`,
    });
  }
  if (tenures.length >= 3 && earlyLeavers / tenures.length >= 0.3) {
    insights.push({
      tone: "warn",
      text: `${pct(earlyLeavers, tenures.length)} % des départs surviennent avant 1 an d'ancienneté : l'accueil et l'intégration des nouvelles recrues sont à revoir.`,
    });
  }
  if (departures.length > 0 && n < departures.length / 2) {
    insights.push({
      tone: "info",
      text: `Seulement ${n} questionnaire${n > 1 ? "s" : ""} rempli${n > 1 ? "s" : ""} sur ${departures.length} départs : les analyses seront plus fiables avec plus de réponses.`,
    });
  }
  if (departures.length === 0) {
    insights.push({ tone: "good", text: `Aucun départ enregistré sur les ${months} derniers mois.` });
  }

  return {
    months,
    totals: {
      departures: departures.length,
      completed: n,
      pending: departures.filter((d) => d.status === "PENDING_SURVEY").length,
      orgRate,
      voluntaryPercent: pct(voluntary, departures.length),
      avgTenureMonths,
      earlyLeaversPercent: pct(earlyLeavers, tenures.length),
      retainablePercent: pct(retainable.length, n),
      recommendPercent: pct(recommend, n),
      wouldReturnPercent: pct(wouldReturn, n),
    },
    reasons,
    departments: departmentsStats,
    monthly,
    ratings,
    levers,
    insights,
    recent: departures.slice(0, 15).map((d) => ({
      id: d.id,
      name: `${d.user.firstName} ${d.user.lastName}`,
      department: nameOf(d.departmentId),
      type: d.type,
      status: d.status,
      lastDay: d.lastDay,
      primaryReason: d.primaryReason ? REASONS[d.primaryReason as ReasonCode]?.label ?? d.primaryReason : null,
      confirmed: Boolean(d.confirmedAt),
      transitionPlanned: Boolean(d.transitionAt),
      closed: Boolean(d.closedAt),
    })),
  };
}
