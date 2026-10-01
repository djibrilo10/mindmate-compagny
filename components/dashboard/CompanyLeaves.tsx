"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarHeart, CheckCircle2, Loader2, Plus, Trash2, Users, X } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { formatCompanyLeaveDates, formatDays } from "@/lib/leave-format";

// ------------------------------------------------------------
// Congés et absences > Congés (AUDIT.md 7.31) : les congés programmés par
// l'entreprise, présentés comme des annonces. Tout le monde les consulte ;
// les admins en programment (toute l'entreprise ou certains départements,
// heures facultatives) et en retirent. Les personnes concernées sont notifiées.
// ------------------------------------------------------------

export type CompanyLeaveRow = {
  id: string;
  title: string;
  message: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  audience: string | null; // noms des départements (admins seulement) ; null = toute l'entreprise
  daysUntil: number; // 0 = aujourd'hui ou en cours
  ongoing: boolean;
};

const input =
  "mt-1 w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12";

export function CompanyLeaves({
  leaves,
  isAdmin,
  departments,
  offeredDays = 0,
}: {
  leaves: CompanyLeaveRow[];
  isAdmin: boolean;
  departments: { id: string; name: string }[];
  offeredDays?: number;
}) {
  const router = useRouter();
  const i18n = useI18n();
  const { t, tx } = i18n;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", startDate: "", endDate: "", startTime: "", endTime: "", message: "" });
  const [everyone, setEveryone] = useState(true);
  const [deptIds, setDeptIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const canSubmit = form.title.trim().length >= 2 && form.startDate && (everyone || deptIds.length > 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/leave/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, endDate: form.endDate || form.startDate, departmentIds: everyone ? [] : deptIds }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      setForm({ title: "", startDate: "", endDate: "", startTime: "", endTime: "", message: "" });
      setEveryone(true);
      setDeptIds([]);
      setOpen(false);
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/leave/company/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      setConfirmId(null);
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="flex h-full flex-col rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base text-[#1C2438]">
            <CalendarHeart className="h-4 w-4 text-[#B07A1E]" strokeWidth={1.9} /> {t("leave.company.title")}
          </h2>
          <p className="mt-0.5 text-sm text-[#5B6478]">{t("leave.company.subtitle")}</p>
          {offeredDays > 0 && (
            <p className="mt-1 inline-flex rounded-full bg-[#FDF3E3] px-2.5 py-0.5 text-xs font-medium text-[#8A6A1C]">
              {t("leave.company.offeredThisYear", { days: formatDays(i18n, offeredDays) })}
            </p>
          )}
        </div>
        {isAdmin && !open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setStatus("idle");
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-3 py-1.5 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px"
          >
            <Plus className="h-4 w-4" strokeWidth={2} /> {t("leave.company.add")}
          </button>
        )}
      </div>

      {status === "saved" && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[#2F6F5E]">
          <CheckCircle2 className="h-4 w-4" /> {t("leave.company.published")}
        </p>
      )}
      {status === "error" && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[#8A3B3B]" role="alert">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      {isAdmin && open && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg border border-[#E2E4E9] bg-[#F7F8FA] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#1C2438]">{t("leave.company.formTitle")}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="text-[#5B6478] hover:text-[#1C2438]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="block text-sm font-medium text-[#1C2438]">
            {t("leave.company.titleLabel")}
            <input value={form.title} onChange={(e) => set("title")(e.target.value)} maxLength={120} placeholder={t("leave.company.titlePlaceholder")} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium text-[#1C2438]">
              {t("leave.company.start")}
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => {
                  set("startDate")(e.target.value);
                  if (!form.endDate || e.target.value > form.endDate) set("endDate")(e.target.value);
                }}
                className={input}
              />
            </label>
            <label className="block text-sm font-medium text-[#1C2438]">
              {t("leave.company.end")}
              <input type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => set("endDate")(e.target.value)} className={input} />
            </label>
            <label className="block text-sm text-[#1C2438]">
              {t("leave.company.startTime")}
              <input type="time" value={form.startTime} onChange={(e) => set("startTime")(e.target.value)} className={input} />
            </label>
            <label className="block text-sm text-[#1C2438]">
              {t("leave.company.endTime")}
              <input type="time" value={form.endTime} onChange={(e) => set("endTime")(e.target.value)} className={input} />
            </label>
          </div>
          <p className="text-xs text-[#5B6478]">{t("leave.company.timesHint")}</p>
          <label className="block text-sm font-medium text-[#1C2438]">
            {t("leave.company.message")} <span className="font-normal text-[#9AA1B2]">{t("leave.form.optional")}</span>
            <textarea value={form.message} onChange={(e) => set("message")(e.target.value)} rows={2} maxLength={1000} placeholder={t("leave.company.messagePlaceholder")} className={input} />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-[#1C2438]">{t("leave.company.audience")}</legend>
            <div className="mt-1 flex flex-wrap gap-2 text-sm">
              {[true, false].map((value) => (
                <label
                  key={String(value)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 ${
                    everyone === value ? "border-[#2F6F5E] bg-[#E7F3EF]" : "border-[#E2E4E9] bg-white"
                  }`}
                >
                  <input type="radio" name="audience" checked={everyone === value} onChange={() => setEveryone(value)} className="accent-[#2F6F5E]" />
                  {value ? t("leave.company.everyone") : t("leave.company.someDepartments")}
                </label>
              ))}
            </div>
            {!everyone && (
              <div className="mt-2 flex flex-wrap gap-2">
                {departments.map((d) => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#E2E4E9] bg-white px-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={deptIds.includes(d.id)}
                      onChange={(e) => setDeptIds((ids) => (e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id)))}
                      className="accent-[#2F6F5E]"
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <button
            type="submit"
            disabled={!canSubmit || status === "saving"}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {status === "saving" && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("leave.company.publish")}
          </button>
        </form>
      )}

      {leaves.length === 0 ? (
        <p className="mt-6 flex-1 text-center text-sm text-[#9AA1B2]">{t("leave.company.empty")}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {leaves.map((l) => (
            <li key={l.id} className="rounded-lg border border-[#F0D9A8] bg-[#FFFBF2] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-[#1C2438]">{l.title}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    l.ongoing || l.daysUntil === 0 ? "bg-[#E7F3EF] text-[#2F6F5E]" : "bg-[#FDF3E3] text-[#8A6A1C]"
                  }`}
                >
                  {l.ongoing ? t("leave.company.inProgress") : l.daysUntil === 0 ? t("leave.company.today") : t("leave.company.inDays", { count: l.daysUntil })}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-[#5B6478]">{formatCompanyLeaveDates(i18n, l)}</p>
              {l.message && <p className="mt-1.5 whitespace-pre-wrap text-sm text-[#1C2438]">{l.message}</p>}
              {isAdmin && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#F0D9A8] pt-2 text-xs text-[#5B6478]">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {l.audience ?? t("leave.company.everyone")}
                  </span>
                  {confirmId === l.id ? (
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => remove(l.id)}
                        disabled={busyId === l.id}
                        className="inline-flex items-center gap-1 rounded-md bg-[#C2542C] px-2 py-1 font-medium text-white disabled:opacity-60"
                      >
                        {busyId === l.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        {t("leave.company.confirmDelete")}
                      </button>
                      <button type="button" onClick={() => setConfirmId(null)} aria-label={t("common.cancel")}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(l.id)}
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:text-[#C2542C]"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("leave.company.delete")}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
