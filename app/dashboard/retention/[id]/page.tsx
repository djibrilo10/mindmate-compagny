import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock3, DoorOpen, Star } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import {
  DEPARTURE_TYPE_LABELS,
  DETAIL_LABELS,
  LEVERS,
  RATING_DIMENSIONS,
  RATING_KEYS,
  REASONS,
  TRI_LABELS,
  type LeverCode,
  type ReasonCode,
} from "@/lib/retention";
import { CancelDepartureButton } from "@/components/dashboard/CancelDepartureButton";
import { TransitionCard } from "@/components/dashboard/TransitionCard";
import { getPrimaryAdminId } from "@/lib/admins";
import type { HandoverItem } from "@/lib/retention-config";

// Détail d'un départ + réponses nominatives au questionnaire (admins, AUDIT.md 7.26).

function formatDate(date: Date) {
  return date.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}
const reasonLabel = (c: string | null) => (c ? REASONS[c as ReasonCode]?.label ?? c : "—");
const tri = (v: string | null) => (v ? TRI_LABELS[v as keyof typeof TRI_LABELS] ?? v : "—");

export default async function DepartureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  if (ctx.role !== "ORG_ADMIN") redirect("/dashboard");

  const { id } = await params;
  const d = await prisma.departure.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: {
      user: { select: { firstName: true, lastName: true, email: true, status: true } },
      recordedBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!d) notFound();

  const department = d.departmentId
    ? (await prisma.department.findUnique({ where: { id: d.departmentId }, select: { name: true } }))?.name ?? "Département supprimé"
    : "Sans département";
  // Fin d'emploi & transition : actions réservées à l'admin principal (7.27).
  const primaryAdminId = await getPrimaryAdminId(ctx.organizationId);
  const confirmedBy = d.confirmedById
    ? await prisma.user.findFirst({
        where: { id: d.confirmedById, organizationId: ctx.organizationId },
        select: { firstName: true, lastName: true },
      })
    : null;

  const tenureMonths = d.hireDate
    ? Math.max(0, Math.round((d.lastDay.getTime() - d.hireDate.getTime()) / (30.44 * 24 * 3600 * 1000)))
    : null;

  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/retention" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#2F6F5E] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Retention Intelligence
      </Link>

      <div className="animate-fade-in-up rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF1F5] text-[#5B6478]">
              <DoorOpen className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl text-[#1C2438]">
                {d.user.firstName} {d.user.lastName}
              </h1>
              <p className="text-sm text-[#5B6478]">
                {department} · {DEPARTURE_TYPE_LABELS[d.type]} · dernier jour le {formatDate(d.lastDay)}
                {tenureMonths !== null ? ` · ${tenureMonths} mois d'ancienneté` : ""}
              </p>
              <p className="text-xs text-[#9AA1B2]">
                {d.recordedBy ? `Enregistré par ${d.recordedBy.firstName} ${d.recordedBy.lastName}` : "Déclaré par l'employé"}
                {d.user.status === "ACTIVE" && (
                  <>
                    {" · compte encore actif — "}
                    <Link href="/dashboard/employees" className="text-[#2F6F5E] hover:underline">
                      désactiver depuis Employés
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
          <CancelDepartureButton departureId={d.id} />
        </div>
      </div>

      <div className="mt-4 animate-fade-in-up stagger-1">
        <TransitionCard
          departureId={d.id}
          employeeFirstName={d.user.firstName}
          isPrimary={primaryAdminId === ctx.userId}
          confirmedAt={d.confirmedAt?.toISOString() ?? null}
          confirmedByName={confirmedBy ? `${confirmedBy.firstName} ${confirmedBy.lastName}` : null}
          transitionAt={d.transitionAt?.toISOString() ?? null}
          location={d.transitionLocation}
          notes={d.transitionNotes}
          items={(Array.isArray(d.handoverItems) ? d.handoverItems : []) as unknown as HandoverItem[]}
          closedAt={d.closedAt?.toISOString() ?? null}
          accountActive={d.user.status === "ACTIVE"}
        />
      </div>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-[#9AA1B2]">Questionnaire de départ</p>

      {d.status !== "COMPLETED" ? (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-5 py-8 text-sm text-[#5B6478]">
          <Clock3 className="h-4 w-4" />
          {d.status === "PENDING_SURVEY"
            ? "Questionnaire envoyé, en attente de réponse de l'employé."
            : "Départ enregistré sans questionnaire."}
        </div>
      ) : (
        <div className="mt-2 space-y-4 animate-fade-in-up stagger-2">
          <section className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9AA1B2]">Raisons du départ</p>
            <p className="mt-2 text-base font-medium text-[#1C2438]">Principale : {reasonLabel(d.primaryReason)}</p>
            {d.secondaryReasons.length > 0 && (
              <p className="mt-1 text-sm text-[#5B6478]">Autres : {d.secondaryReasons.map(reasonLabel).join(", ")}</p>
            )}
            {d.details.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {d.details.map((code) => (
                  <li key={code} className="rounded-full bg-[#F3F5F8] px-2.5 py-1 text-xs text-[#1C2438]">
                    {DETAIL_LABELS[code] ?? code}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9AA1B2]">Notes (sur 5)</p>
            <ul className="mt-3 space-y-2">
              {RATING_KEYS.map((key) => {
                const v = d[key];
                return (
                  <li key={key} className="flex items-center justify-between text-sm">
                    <span className="text-[#1C2438]">{RATING_DIMENSIONS[key]}</span>
                    <span className="flex items-center gap-0.5" aria-label={`${v ?? 0} sur 5`}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`h-4 w-4 ${s <= (v ?? 0) ? "text-[#2F6F5E]" : "text-[#E2E4E9]"}`}
                          fill={s <= (v ?? 0) ? "currentColor" : "none"}
                        />
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm text-sm text-[#1C2438]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9AA1B2]">Rétention</p>
            <p className="mt-2">Aurait-on pu le/la retenir ? <strong>{tri(d.couldBeRetained)}</strong></p>
            {d.retentionLever && <p className="mt-1">Ce qui l&apos;aurait retenu(e) : <strong>{LEVERS[d.retentionLever as LeverCode] ?? d.retentionLever}</strong></p>}
            <p className="mt-1">Recommanderait l&apos;entreprise : <strong>{tri(d.wouldRecommend)}</strong></p>
            <p className="mt-1">Pourrait revenir : <strong>{tri(d.wouldReturn)}</strong></p>
            {d.comment && (
              <blockquote className="mt-3 whitespace-pre-wrap rounded-lg bg-[#F7F8FA] px-4 py-3 text-[#1C2438]">{d.comment}</blockquote>
            )}
            {d.submittedAt && <p className="mt-3 text-xs text-[#9AA1B2]">Questionnaire rempli le {formatDate(d.submittedAt)}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
