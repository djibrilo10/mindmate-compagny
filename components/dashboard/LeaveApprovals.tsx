"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, Check, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { formatDays, formatLeaveDates } from "@/lib/leave-format";

// Congés > À approuver (voir AUDIT.md 7.30) : admins (toute l'entreprise) et
// gérants (leur département). Refus = note obligatoire.

export type PendingLeaveRow = {
  id: string;
  name: string;
  department: string | null;
  typeLabel: string;
  color: string;
  startDate: string;
  endDate: string;
  halfDay: string | null;
  days: number | null;
  comment: string;
  createdAt: string;
  overlapNames: string[];
  balanceAfter: number | null; // null = type non décompté
};

export function LeaveApprovals({ rows }: { rows: PendingLeaveRow[] }) {
  const router = useRouter();
  const i18n = useI18n();
  const { t, tx, formatDate, formatNumber } = i18n;
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function decide(id: string, action: "approve" | "reject") {
    const note = (notes[id] ?? "").trim();
    if (action === "reject" && !note) {
      setErrors((e) => ({ ...e, [id]: t("leave.errors.noteRequired") }));
      return;
    }
    setBusy(id + action);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/absences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      router.refresh();
    } catch (e) {
      setErrors((x) => ({ ...x, [id]: e instanceof Error ? e.message : t("common.unknownError") }));
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-10 text-center text-sm text-[#5B6478]">
        {t("leave.approvals.empty")}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="rounded-xl border border-[#E2E4E9] bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#1C2438]">
                {r.name}
                {r.department && <span className="font-normal text-[#9AA1B2]"> · {r.department}</span>}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-[#1C2438]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                  {r.typeLabel}
                </span>
                <span className="text-[#5B6478]">
                  {formatLeaveDates(i18n, r.startDate, r.endDate, r.halfDay)}
                  {r.days != null && ` · ${formatDays(i18n, r.days)}`}
                </span>
              </p>
              {r.comment && <p className="mt-1 text-xs text-[#5B6478]">« {r.comment} »</p>}
            </div>
            <span className="text-xs text-[#9AA1B2]">
              {t("leave.approvals.requestedOn", { date: formatDate(r.createdAt, { day: "numeric", month: "short" }) })}
            </span>
          </div>

          <div className="mt-2 space-y-1 text-xs">
            {r.balanceAfter != null && (
              <p className={r.balanceAfter < 0 ? "text-[#8A3B3B]" : "text-[#5B6478]"}>
                {t("leave.approvals.balanceAfter", { value: formatNumber(r.balanceAfter) })}
              </p>
            )}
            {r.overlapNames.length > 0 && (
              <p className="flex items-start gap-1.5 text-[#6B5215]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t("leave.approvals.overlap", { count: r.overlapNames.length, names: r.overlapNames.join(", ") })}
              </p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={notes[r.id] ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
              maxLength={500}
              placeholder={t("leave.approvals.notePlaceholder")}
              className="min-w-0 flex-1 rounded-lg border border-[#E2E4E9] px-3 py-1.5 text-sm focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
            />
            <button
              type="button"
              onClick={() => decide(r.id, "approve")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-md bg-[#2F6F5E] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#265A4C] disabled:opacity-60"
            >
              {busy === r.id + "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t("leave.approvals.approve")}
            </button>
            <button
              type="button"
              onClick={() => decide(r.id, "reject")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-md border border-[#8A3B3B] px-3 py-1.5 text-xs font-medium text-[#8A3B3B] hover:bg-[#FDECEC] disabled:opacity-60"
            >
              {busy === r.id + "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              {t("leave.approvals.reject")}
            </button>
          </div>
          {errors[r.id] && (
            <p className="mt-2 flex items-center gap-1 text-xs text-[#8A3B3B]" role="alert">
              <AlertCircle className="h-3.5 w-3.5" /> {errors[r.id]}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
