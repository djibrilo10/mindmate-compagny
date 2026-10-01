"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { formatDays, formatLeaveDates, LEAVE_STATUS_STYLES as STATUS_STYLES } from "@/lib/leave-format";

// Congés > Mes demandes (voir AUDIT.md 7.30) : statut, décision, annulation.

export type MyLeaveRow = {
  id: string;
  typeLabel: string;
  color: string;
  startDate: string;
  endDate: string;
  halfDay: string | null;
  days: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  comment: string;
  decidedByName: string | null;
  decisionNote: string | null;
  cancellable: boolean;
};

export function AbsencesList({ rows }: { rows: MyLeaveRow[] }) {
  const router = useRouter();
  const i18n = useI18n();
  const { t, tx } = i18n;
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function cancel(id: string) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/absences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      setConfirmId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-[#E2E4E9] bg-white shadow-sm">
      <h2 className="border-b border-[#E2E4E9] px-5 py-3 font-[family-name:var(--font-display)] text-base text-[#1C2438]">
        {t("leave.mine.title")}
      </h2>
      {error && (
        <p className="mx-5 mt-3 flex items-center gap-1 text-sm text-[#8A3B3B]" role="alert">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[#9AA1B2]">{t("leave.mine.empty")}</p>
      ) : (
        <ul className="divide-y divide-[#E2E4E9]">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#1C2438]">
                  {r.typeLabel}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[r.status]}`}>
                    {t(`leave.status.${r.status}`)}
                  </span>
                </p>
                <p className="text-sm text-[#5B6478]">
                  {formatLeaveDates(i18n, r.startDate, r.endDate, r.halfDay)}
                  {r.days != null && ` · ${formatDays(i18n, r.days)}`}
                </p>
                {r.comment && <p className="mt-0.5 text-xs text-[#9AA1B2]">« {r.comment} »</p>}
                {r.decidedByName && (r.status === "APPROVED" || r.status === "REJECTED") && (
                  <p className="mt-0.5 text-xs text-[#5B6478]">
                    {t("leave.mine.decidedBy", { name: r.decidedByName })}
                    {r.decisionNote ? ` · ${t("leave.mine.note", { note: r.decisionNote })}` : ""}
                  </p>
                )}
              </div>
              {r.cancellable &&
                (confirmId === r.id ? (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => cancel(r.id)}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1 rounded-md bg-[#C2542C] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#A8451F] disabled:opacity-60"
                    >
                      {busyId === r.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      {t("leave.mine.confirmCancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      aria-label={t("common.close")}
                      className="text-[#5B6478] hover:text-[#1C2438]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(r.id)}
                    className="rounded-md border border-[#DADEE5] px-2.5 py-1.5 text-xs font-medium text-[#5B6478] hover:border-[#C2542C] hover:text-[#C2542C]"
                  >
                    {t("leave.mine.cancel")}
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
