"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { formatDays } from "@/lib/leave-format";

// ------------------------------------------------------------
// Congés > Nouvelle demande (voir AUDIT.md 7.30) : type, dates, demi-journée,
// commentaire. Aperçu du nombre de jours ouvrables et avertissement si la
// demande dépasse le solde (non bloquant : l'approbateur décide).
// Le serveur recalcule tout (jamais confiance au navigateur).
// ------------------------------------------------------------

export type LeaveTypeOption = { id: string; label: string; color: string; available: number | null; used: number };

const inputClass =
  "mt-1 w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12";

function workingDays(start: string, end: string, half: boolean, closed: Set<string>) {
  if (!start) return 0;
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${(half ? start : end) || start}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  let n = 0;
  for (const d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !closed.has(d.toISOString().slice(0, 10))) n += 1;
  }
  return half ? (n > 0 ? 0.5 : 0) : n;
}

// closedDays : journées entières de congé programmé par l'entreprise pour cette
// personne ("AAAA-MM-JJ"), retirées de l'aperçu comme sur le serveur (7.31).
export function AbsenceForm({ types, closedDays = [] }: { types: LeaveTypeOption[]; closedDays?: string[] }) {
  const router = useRouter();
  const i18n = useI18n();
  const { t, tx, formatNumber } = i18n;
  const [leaveTypeId, setLeaveTypeId] = useState(types[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [half, setHalf] = useState<"" | "AM" | "PM">("");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const type = types.find((x) => x.id === leaveTypeId);
  const closed = useMemo(() => new Set(closedDays), [closedDays]);
  const days = useMemo(() => workingDays(startDate, endDate, half !== "", closed), [startDate, endDate, half, closed]);
  const exceeds = type?.available != null && days > type.available;
  const canSubmit = Boolean(leaveTypeId && startDate && (half || endDate) && days > 0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/absences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leaveTypeId,
          startDate,
          endDate: half ? startDate : endDate,
          halfDay: half || null,
          comment,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("leave.form.sendFailed"));
      setStartDate("");
      setEndDate("");
      setHalf("");
      setComment("");
      setStatus("success");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
      <h2 className="font-[family-name:var(--font-display)] text-base text-[#1C2438]">{t("leave.form.title")}</h2>

      <label className="mt-4 block text-sm font-medium text-[#1C2438]">
        {t("leave.form.type")}
        <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className={inputClass}>
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      {type?.available != null ? (
        <p className={`mt-1.5 text-sm ${type.available <= 0 ? "text-[#8A3B3B]" : "text-[#2F6F5E]"}`}>
          {t("leave.form.remaining", { days: formatDays(i18n, type.available) })}
        </p>
      ) : type && type.used > 0 ? (
        <p className="mt-1.5 text-sm text-[#5B6478]">{t("leave.form.takenThisYear", { days: formatDays(i18n, type.used) })}</p>
      ) : null}

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-[#1C2438]">{t("leave.form.duration")}</legend>
        <div className="mt-1 flex flex-wrap gap-2 text-sm">
          {(
            [
              ["", t("leave.form.fullDays")],
              ["AM", `${t("leave.form.halfDay")} · ${t("leave.form.morning")}`],
              ["PM", `${t("leave.form.halfDay")} · ${t("leave.form.afternoon")}`],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value || "full"}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 ${
                half === value ? "border-[#2F6F5E] bg-[#E7F3EF]" : "border-[#E2E4E9] hover:border-[#C7CBD6]"
              }`}
            >
              <input
                type="radio"
                name="duration"
                checked={half === value}
                onChange={() => setHalf(value)}
                className="accent-[#2F6F5E]"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={`mt-4 grid gap-3 ${half ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        <label className="block text-sm font-medium text-[#1C2438]">
          {t("leave.form.start")}
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (!endDate || e.target.value > endDate) setEndDate(e.target.value);
            }}
            className={inputClass}
          />
        </label>
        {!half && (
          <label className="block text-sm font-medium text-[#1C2438]">
            {t("leave.form.end")}
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
      </div>

      <label className="mt-4 block text-sm font-medium text-[#1C2438]">
        {t("leave.form.comment")} <span className="font-normal text-[#9AA1B2]">{t("leave.form.optional")}</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder={t("leave.form.commentPlaceholder")}
          className={inputClass}
        />
      </label>

      {startDate && (
        <p className="mt-3 text-sm text-[#1C2438]">
          {t("leave.form.count", { days: formatDays(i18n, days) })}
          <span className="mt-0.5 block text-xs text-[#9AA1B2]">{t("leave.form.weekdaysOnly")}</span>
        </p>
      )}
      {exceeds && type?.available != null && (
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-[#FDF3E3] px-3 py-2 text-xs text-[#6B5215]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("leave.form.exceeds", { available: formatNumber(type.available) })}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit || status === "loading"}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
          {t("leave.form.submit")}
        </button>
        {status === "success" && (
          <span className="inline-flex items-center gap-1 text-sm text-[#2F6F5E]">
            <CheckCircle2 className="h-4 w-4" /> {t("leave.form.sent")}
          </span>
        )}
        {status === "error" && (
          <span className="inline-flex items-center gap-1 text-sm text-[#8A3B3B]" role="alert">
            <AlertCircle className="h-4 w-4" /> {error}
          </span>
        )}
      </div>
    </form>
  );
}
