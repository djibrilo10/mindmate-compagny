"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, CalendarHeart, CheckCircle2, Copy, Loader2, Lock, Plus, Send, Trash2, Upload, Users, X } from "lucide-react";
import { ScheduleFilesList, type ScheduleFileItem } from "@/components/dashboard/ScheduleFilesList";
import { MAX_SCHEDULE_FILE_SIZE, SCHEDULE_FILE_ACCEPT, scheduleFileMimeType } from "@/lib/schedule-file-types";
import { useI18n } from "@/components/i18n/I18nProvider";
import { addDays } from "@/lib/schedule-time";

// ------------------------------------------------------------
// Grille des horaires pour l'admin et les responsables (AUDIT.md 7.36) :
// une ligne par personne, une colonne par jour. Les quarts en brouillon ont
// une bordure pointillée ; « Publier la semaine » les rend visibles aux
// employés (avec notification). Clic sur une case vide (+) = ajouter un
// quart ; clic sur un quart = le modifier ou le supprimer.
// ------------------------------------------------------------

export type BoardShift = {
  id: string;
  userId: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  position: string;
  note: string;
  published: boolean;
  teamVisible: boolean;
};

type Department = { id: string; name: string; color: string };
type Employee = { id: string; name: string; department: Department | null };

type Editor = {
  id?: string;
  userId: string;
  date: string;
  start: string;
  end: string;
  position: string;
  note: string;
};

const NONE = "__none__";

export function ScheduleBoard({
  week,
  days,
  today,
  employees,
  shifts,
  absences,
  files,
  uploadDepartments,
  canUploadToAll,
}: {
  week: string;
  days: string[];
  today: string;
  employees: Employee[];
  shifts: BoardShift[];
  absences: Record<string, string[]>;
  files: ScheduleFileItem[];
  uploadDepartments: Department[];
  canUploadToAll: boolean;
}) {
  const router = useRouter();
  const { t, tx, formatDate, formatNumber } = useI18n();
  const hours = (minutes: number) => `${formatNumber(minutes / 60, { maximumFractionDigits: 1 })} h`;
  const [filter, setFilter] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [lastTimes, setLastTimes] = useState({ start: "09:00", end: "17:00" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Fenêtre « Publier » (AUDIT.md 7.37) : département ciblé + visibilité.
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishDept, setPublishDept] = useState("");
  const [teamVisible, setTeamVisible] = useState(false);
  // Téléverser un horaire en fichier (AUDIT.md 7.39).
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadScope, setUploadScope] = useState<"all" | "department">(canUploadToAll ? "all" : "department");
  const [uploadDept, setUploadDept] = useState(uploadDepartments[0]?.id ?? "");
  const [uploadNotify, setUploadNotify] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Deux façons de voir la semaine (AUDIT.md 7.38) : « Par jour » (simple,
  // idéale sur téléphone) et « Tableau » (vue d'ensemble sur ordinateur).
  const [view, setView] = useState<"days" | "grid">("grid");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("mm_schedule_view");
      if (saved === "days" || saved === "grid") {
        setView(saved);
        return;
      }
    } catch {
      // stockage indisponible : on garde le choix automatique
    }
    if (window.matchMedia("(max-width: 767px)").matches) setView("days");
  }, []);
  function chooseView(next: "days" | "grid") {
    setView(next);
    try {
      window.localStorage.setItem("mm_schedule_view", next);
    } catch {
      // sans importance
    }
  }

  const departments = useMemo(() => {
    const map = new Map<string, Department>();
    for (const e of employees) if (e.department) map.set(e.department.id, e.department);
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const visibleEmployees = employees.filter((e) => !filter || (e.department?.id ?? NONE) === filter);
  const visibleIds = new Set(visibleEmployees.map((e) => e.id));
  const drafts = shifts.filter((s) => !s.published).length;
  const positions = useMemo(() => Array.from(new Set(shifts.map((s) => s.position).filter(Boolean))).sort(), [shifts]);
  const inPublishScope = (s: BoardShift) => {
    if (!publishDept) return true;
    const emp = employees.find((e) => e.id === s.userId);
    return (emp?.department?.id ?? NONE) === publishDept;
  };
  const scopeShifts = shifts.filter(inPublishScope);
  const scopeDrafts = scopeShifts.filter((s) => !s.published);
  const scopePeople = new Set(scopeDrafts.map((s) => s.userId)).size;
  const hasNoDepartment = employees.some((e) => !e.department);
  const dayTotals = days.map((d) => shifts.filter((s) => s.date === d && visibleIds.has(s.userId)).reduce((sum, s) => sum + s.minutes, 0));

  function openCreate(userId: string, date: string) {
    setError(null);
    setEditor({ userId, date, start: lastTimes.start, end: lastTimes.end, position: "", note: "" });
  }

  function openUpload() {
    setUploadFile(null);
    setUploadTitle("");
    setUploadError(null);
    setUploadScope(canUploadToAll ? "all" : "department");
    setUploadDept(uploadDepartments[0]?.id ?? "");
    setUploadNotify(true);
    setUploadOpen(true);
  }

  function pickFile(file: File | null) {
    setUploadError(null);
    if (!file) return setUploadFile(null);
    if (!scheduleFileMimeType(file.name)) return setUploadError(t("schedule.upload.errors.badType"));
    if (file.size > MAX_SCHEDULE_FILE_SIZE) return setUploadError(t("schedule.upload.errors.tooBig"));
    setUploadFile(file);
  }

  async function submitUpload(e: FormEvent) {
    e.preventDefault();
    if (!uploadFile) return setUploadError(t("schedule.upload.errors.noFile"));
    if (uploadScope === "department" && !uploadDept) return setUploadError(t("schedule.upload.errors.chooseDepartment"));
    setBusy("upload");
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      form.append("week", week);
      form.append("title", uploadTitle);
      form.append("departmentId", uploadScope === "department" ? uploadDept : "");
      form.append("notify", uploadNotify ? "1" : "0");
      const res = await fetch("/api/schedule-files", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      setUploadOpen(false);
      setMessage({ ok: true, text: uploadNotify ? t("schedule.upload.doneNotified") : t("schedule.upload.done") });
      router.refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setBusy(null);
    }
  }

  /** Bouton principal « Ajouter un quart » : premier employé, aujourd'hui (ou lundi). */
  function openNew(date?: string) {
    const first = visibleEmployees[0] ?? employees[0];
    if (!first) return;
    openCreate(first.id, date ?? (days.includes(today) ? today : days[0]));
  }

  function openEdit(s: BoardShift) {
    setError(null);
    setEditor({ id: s.id, userId: s.userId, date: s.date, start: s.start, end: s.end, position: s.position, note: s.note });
  }

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
    return data;
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editor) return;
    setBusy("save");
    setError(null);
    try {
      const payload = { userId: editor.userId, date: editor.date, start: editor.start, end: editor.end, position: editor.position, note: editor.note };
      if (editor.id) await call(`/api/shifts/${editor.id}`, "PATCH", payload);
      else await call("/api/shifts", "POST", payload);
      setLastTimes({ start: editor.start, end: editor.end });
      setEditor(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!editor?.id || !window.confirm(t("schedule.confirmDelete"))) return;
    setBusy("delete");
    setError(null);
    try {
      await call(`/api/shifts/${editor.id}`, "DELETE");
      setEditor(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setBusy(null);
    }
  }

  function openPublish() {
    setMessage(null);
    setPublishDept(filter);
    // Par défaut, on reprend le choix déjà fait pour cette semaine s'il y en a un.
    setTeamVisible(shifts.some((s) => s.published && s.teamVisible));
    setPublishOpen(true);
  }

  async function publish(e: FormEvent) {
    e.preventDefault();
    setBusy("publish");
    setMessage(null);
    try {
      const data = await call("/api/shifts/publish", "POST", { week, departmentId: publishDept, teamVisible });
      const published = data?.published ?? 0;
      setMessage({
        ok: true,
        text: published > 0 ? t("schedule.published", { count: published }) : t("schedule.visibilitySaved"),
      });
      setPublishOpen(false);
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : t("common.unknownError") });
    } finally {
      setBusy(null);
    }
  }

  async function copyPrevious() {
    if (!window.confirm(t("schedule.confirmCopy"))) return;
    setBusy("copy");
    setMessage(null);
    try {
      const data = await call("/api/shifts/copy-week", "POST", { fromWeek: addDays(week, -7), toWeek: week });
      const copied = data?.copied ?? 0;
      const skipped = data?.skipped ?? 0;
      setMessage({
        ok: copied > 0,
        text: copied === 0 && skipped === 0 ? t("schedule.copiedNone") : t("schedule.copied", { count: copied, skipped }),
      });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : t("common.unknownError") });
    } finally {
      setBusy(null);
    }
  }

  if (employees.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
        <p className="text-sm text-[#5B6478]">{t("schedule.noEmployees")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Mode d'emploi en 3 étapes (AUDIT.md 7.38) */}
      <ol className="grid gap-2 rounded-xl border border-[#E2E4E9] bg-white p-3 text-sm text-[#1C2438] shadow-sm sm:grid-cols-3">
        {[t("schedule.step1"), t("schedule.step2"), t("schedule.step3")].map((step, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2F6F5E] text-xs font-semibold text-white">{i + 1}</span>
            <span className="pt-0.5 leading-snug">{step}</span>
          </li>
        ))}
      </ol>

      {/* Actions principales */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => openNew()}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-5 py-3 text-base font-semibold text-white shadow-sm disabled:opacity-50"
        >
          <Plus className="h-5 w-5" /> {t("schedule.addShift")}
        </button>
        <button
          type="button"
          onClick={copyPrevious}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-[#C7CBD6] bg-white px-4 py-3 text-sm font-medium text-[#1C2438] hover:bg-[#F7F8FA] disabled:opacity-50"
        >
          {busy === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          {t("schedule.copyPrevious")}
        </button>
        {(canUploadToAll || uploadDepartments.length > 0) && (
          <button
            type="button"
            onClick={openUpload}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-[#C7CBD6] bg-white px-4 py-3 text-sm font-medium text-[#1C2438] hover:bg-[#F7F8FA] disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> {t("schedule.upload.button")}
          </button>
        )}
        <div className="ml-auto inline-flex rounded-xl border border-[#C7CBD6] bg-white p-1 text-sm">
          {(["days", "grid"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => chooseView(v)}
              className={`rounded-lg px-3 py-1.5 font-medium ${view === v ? "bg-[#1C2438] text-white" : "text-[#5B6478] hover:bg-[#F7F8FA]"}`}
            >
              {v === "days" ? t("schedule.viewDays") : t("schedule.viewGrid")}
            </button>
          ))}
        </div>
      </div>

      {departments.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("")}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === "" ? "border-[#1C2438] bg-[#1C2438] text-white" : "border-[#E2E4E9] bg-white text-[#5B6478]"}`}
          >
            {t("schedule.allDepartments")}
          </button>
          {departments.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setFilter(filter === d.id ? "" : d.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${filter === d.id ? "border-[#1C2438] bg-[#1C2438] text-white" : "border-[#E2E4E9] bg-white text-[#1C2438]"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
              {d.name}
            </button>
          ))}
        </div>
      )}

      {/* État de l'envoi : bien visible, avec le bouton juste à côté */}
      {drafts > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E0A43A]/50 bg-[#FFF8EA] p-3.5">
          <p className="flex items-start gap-2 text-sm font-medium text-[#7A4E0B]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t("schedule.draftsBanner", { count: drafts })}
          </p>
          <button
            type="button"
            onClick={openPublish}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-[#2F6F5E] px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("schedule.publish", { count: drafts })}
          </button>
        </div>
      ) : shifts.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2F6F5E]/30 bg-[#F3F9F7] p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-[#265A4C]">
            <CheckCircle2 className="h-4 w-4" /> {t("schedule.allSent")}
          </p>
          <button type="button" onClick={openPublish} className="text-sm font-medium text-[#2F6F5E] underline-offset-2 hover:underline">
            {t("schedule.visibilityButton")}
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#C7CBD6] bg-white p-4 text-sm text-[#5B6478]">{t("schedule.emptyWeek")}</div>
      )}

      {message && (
        <p className={`flex items-center gap-1.5 text-sm ${message.ok ? "text-[#2F6F5E]" : "text-[#8A3B3B]"}`} role={message.ok ? undefined : "alert"}>
          {message.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {message.text}
        </p>
      )}

      <ScheduleFilesList files={files} />

      {/* Vue « Par jour » : une carte par jour, en mots simples (AUDIT.md 7.38) */}
      {view === "days" && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {days.map((d) => {
            const dayShifts = shifts
              .filter((s) => s.date === d && visibleIds.has(s.userId))
              .sort((a, b) => a.start.localeCompare(b.start));
            const onLeave = visibleEmployees.filter((e) => (absences[e.id] ?? []).includes(d));
            return (
              <div key={d} className={`flex flex-col rounded-xl border bg-white p-3.5 shadow-sm ${d === today ? "border-[#2F6F5E] ring-2 ring-[#2F6F5E]/15" : "border-[#E2E4E9]"}`}>
                <p className="text-sm font-semibold text-[#1C2438] first-letter:uppercase">
                  {formatDate(`${d}T12:00:00Z`, { weekday: "long", day: "numeric", month: "long" })}
                  {d === today && <span className="ml-2 rounded-full bg-[#E7F3EF] px-2 py-0.5 text-[11px] font-medium normal-case text-[#2F6F5E]">{t("schedule.today")}</span>}
                </p>
                <div className="mt-2.5 flex flex-1 flex-col gap-2">
                  {dayShifts.length === 0 && <p className="text-sm text-[#9AA1B2]">{t("schedule.nobodyScheduled")}</p>}
                  {dayShifts.map((s) => {
                    const emp = employees.find((e) => e.id === s.userId);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openEdit(s)}
                        className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                          s.published ? "border-[#2F6F5E]/50 bg-[#F3F9F7] hover:bg-[#E7F3EF]" : "border-dashed border-[#9AA1B2] bg-white hover:bg-[#F7F8FA]"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold text-[#1C2438]">{emp?.name}</span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.published ? "bg-[#E7F3EF] text-[#265A4C]" : "bg-[#FFF4E0] text-[#8A5A12]"}`}>
                            {s.published ? t("schedule.statusSent") : t("schedule.statusDraft")}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-base text-[#1C2438]">
                          {s.start} – {s.end}
                          {s.position && <span className="text-sm text-[#2F6F5E]"> · {s.position}</span>}
                        </span>
                      </button>
                    );
                  })}
                  {onLeave.map((e) => (
                    <p key={e.id} className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFF4E0] px-3 py-1.5 text-sm text-[#8A5A12]">
                      <CalendarHeart className="h-4 w-4" /> {e.name} · {t("schedule.onLeave")}
                    </p>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => openNew(d)}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#2F6F5E]/60 px-3 py-2 text-sm font-medium text-[#2F6F5E] hover:bg-[#F3F9F7]"
                >
                  <Plus className="h-4 w-4" /> {t("schedule.addForDay")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {view === "grid" && (
        <>
      <p className="flex flex-wrap items-center gap-3 text-xs text-[#5B6478]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded border border-[#2F6F5E] bg-[#E7F3EF]" /> {t("schedule.legendPublished")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded border border-dashed border-[#9AA1B2] bg-white" /> {t("schedule.legendDraft")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-[#2F6F5E]" /> {t("schedule.legendTeam")}
        </span>
      </p>
      {/* Grille */}
      <div className="overflow-x-auto rounded-xl border border-[#E2E4E9] bg-white shadow-sm">
        <table className="w-full min-w-[980px] table-fixed text-left text-sm">
          <thead className="bg-[#F7F8FA] text-xs text-[#5B6478]">
            <tr>
              <th className="w-44 px-3 py-2.5 font-medium">{t("schedule.employee")}</th>
              {days.map((d) => (
                <th key={d} className={`px-2 py-2.5 font-medium ${d === today ? "text-[#2F6F5E]" : ""}`}>
                  <span className="block capitalize">{formatDate(`${d}T12:00:00Z`, { weekday: "short" })}</span>
                  <span className={`block text-sm ${d === today ? "font-semibold" : "text-[#1C2438]"}`}>{formatDate(`${d}T12:00:00Z`, { day: "numeric", month: "short" })}</span>
                </th>
              ))}
              <th className="w-16 px-2 py-2.5 text-right font-medium">{t("schedule.total")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E4E9]">
            {visibleEmployees.map((emp) => {
              const empShifts = shifts.filter((s) => s.userId === emp.id);
              const total = empShifts.reduce((sum, s) => sum + s.minutes, 0);
              const off = new Set(absences[emp.id] ?? []);
              return (
                <tr key={emp.id} className="align-top">
                  <td className="px-3 py-2.5">
                    <p className="truncate font-medium text-[#1C2438]">{emp.name}</p>
                    {emp.department && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[#5B6478]">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: emp.department.color }} aria-hidden />
                        {emp.department.name}
                      </p>
                    )}
                  </td>
                  {days.map((d) => (
                    <td key={d} className={`px-1.5 py-1.5 ${d === today ? "bg-[#F6FBF9]" : ""}`}>
                      <div className="flex min-h-[3.25rem] flex-col gap-1">
                        {off.has(d) && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#FFF4E0] px-1.5 py-0.5 text-[11px] font-medium text-[#8A5A12]">
                            <CalendarHeart className="h-3 w-3" /> {t("schedule.onLeave")}
                          </span>
                        )}
                        {empShifts
                          .filter((s) => s.date === d)
                          .map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => openEdit(s)}
                              title={s.note || undefined}
                              className={`rounded-md border px-1.5 py-1 text-left text-xs leading-tight transition-colors ${
                                s.published
                                  ? "border-[#2F6F5E] bg-[#E7F3EF] text-[#1C2438] hover:bg-[#D8EEE6]"
                                  : "border-dashed border-[#9AA1B2] bg-white text-[#1C2438] hover:bg-[#F7F8FA]"
                              }`}
                            >
                              <span className="flex items-center gap-1 font-semibold">
                                {s.start}–{s.end}
                                {s.published && s.teamVisible && <Users className="h-3 w-3 shrink-0 text-[#2F6F5E]" aria-label={t("schedule.legendTeam")} />}
                              </span>
                              {s.position && <span className="block truncate text-[#2F6F5E]">{s.position}</span>}
                            </button>
                          ))}
                        <button
                          type="button"
                          onClick={() => openCreate(emp.id, d)}
                          aria-label={t("schedule.addShiftFor", { name: emp.name })}
                          className="flex h-6 items-center justify-center rounded-md border border-transparent text-[#9AA1B2] hover:border-[#C7CBD6] hover:bg-[#F7F8FA] hover:text-[#2F6F5E]"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  ))}
                  <td className="px-2 py-2.5 text-right text-xs font-medium text-[#1C2438]">{total > 0 ? hours(total) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-[#F7F8FA] text-xs text-[#5B6478]">
            <tr>
              <td className="px-3 py-2 font-medium">{t("schedule.dayTotal")}</td>
              {dayTotals.map((m, i) => (
                <td key={days[i]} className="px-2 py-2">{m > 0 ? hours(m) : "—"}</td>
              ))}
              <td className="px-2 py-2 text-right font-semibold text-[#1C2438]">{hours(dayTotals.reduce((a, b) => a + b, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>

        </>
      )}

      {/* Fenêtre « Téléverser un horaire » (AUDIT.md 7.39) */}
      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1C2438]/40 p-4 sm:items-center" onClick={() => busy === null && setUploadOpen(false)}>
          <form onSubmit={submitUpload} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-md animate-scale-in overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#1C2438]">{t("schedule.upload.title")}</h2>
                <p className="mt-0.5 text-sm text-[#5B6478]">
                  {t("schedule.weekOf", { date: formatDate(`${week}T12:00:00Z`, { month: "long", day: "numeric" }) })}
                </p>
              </div>
              <button type="button" onClick={() => setUploadOpen(false)} aria-label={t("common.close")} className="rounded-md p-1 text-[#5B6478] hover:bg-[#F7F8FA]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#2F6F5E]/50 bg-[#F3F9F7] px-4 py-6 text-center hover:bg-[#E7F3EF]">
              <Upload className="h-7 w-7 text-[#2F6F5E]" />
              <span className="text-sm font-semibold text-[#1C2438]">{uploadFile ? uploadFile.name : t("schedule.upload.choose")}</span>
              <span className="text-xs text-[#5B6478]">{t("schedule.upload.formats")}</span>
              <input
                type="file"
                accept={SCHEDULE_FILE_ACCEPT}
                className="sr-only"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="font-medium text-[#1C2438]">
                {t("schedule.upload.name")} <span className="font-normal text-[#9AA1B2]">{t("schedule.optional")}</span>
              </span>
              <input
                value={uploadTitle}
                maxLength={120}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder={t("schedule.upload.namePlaceholder")}
                className="rounded-lg border border-[#DADEE5] px-3 py-2 text-sm"
              />
            </label>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-[#1C2438]">{t("schedule.upload.whoSees")}</legend>
              <div className="mt-2 space-y-2">
                {canUploadToAll && (
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${uploadScope === "all" ? "border-[#2F6F5E] bg-[#F3F9F7]" : "border-[#E2E4E9] hover:bg-[#F7F8FA]"}`}>
                    <input type="radio" name="uploadScope" checked={uploadScope === "all"} onChange={() => setUploadScope("all")} className="mt-1 accent-[#2F6F5E]" />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-medium text-[#1C2438]">
                        <Users className="h-4 w-4 text-[#2F6F5E]" /> {t("schedule.upload.scopeAll")}
                      </span>
                      <span className="mt-0.5 block text-xs text-[#5B6478]">{t("schedule.upload.scopeAllHelp")}</span>
                    </span>
                  </label>
                )}
                {uploadDepartments.length > 0 && (
                  <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${uploadScope === "department" ? "border-[#2F6F5E] bg-[#F3F9F7]" : "border-[#E2E4E9] hover:bg-[#F7F8FA]"}`}>
                    <input type="radio" name="uploadScope" checked={uploadScope === "department"} onChange={() => setUploadScope("department")} className="mt-1 accent-[#2F6F5E]" />
                    <span className="flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-[#1C2438]">
                        <Lock className="h-4 w-4 text-[#2F6F5E]" /> {t("schedule.upload.scopeDepartment")}
                      </span>
                      <span className="mt-0.5 block text-xs text-[#5B6478]">{t("schedule.upload.scopeDepartmentHelp")}</span>
                      {uploadScope === "department" && (
                        <select
                          value={uploadDept}
                          onChange={(e) => setUploadDept(e.target.value)}
                          className="mt-2 w-full rounded-lg border border-[#DADEE5] bg-white px-3 py-2 text-sm"
                        >
                          {uploadDepartments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </span>
                  </label>
                )}
              </div>
            </fieldset>

            <label className="mt-4 flex items-start gap-2.5 text-sm text-[#1C2438]">
              <input type="checkbox" checked={uploadNotify} onChange={(e) => setUploadNotify(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2F6F5E]" />
              <span>{t("schedule.upload.notify")}</span>
            </label>

            {uploadError && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-[#8A3B3B]" role="alert">
                <AlertCircle className="h-4 w-4" /> {uploadError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setUploadOpen(false)} className="rounded-lg px-3 py-2 text-sm text-[#5B6478] hover:bg-[#F7F8FA]">
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy !== null || !uploadFile}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t("schedule.upload.submit")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fenêtre « Publier » : département + visibilité (AUDIT.md 7.37) */}
      {publishOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1C2438]/40 p-4 sm:items-center" onClick={() => busy === null && setPublishOpen(false)}>
          <form onSubmit={publish} onClick={(e) => e.stopPropagation()} className="w-full max-w-md animate-scale-in rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#1C2438]">{t("schedule.publishTitle")}</h2>
                <p className="mt-0.5 text-sm text-[#5B6478]">
                  {t("schedule.weekOf", { date: formatDate(`${week}T12:00:00Z`, { month: "long", day: "numeric" }) })}
                </p>
              </div>
              <button type="button" onClick={() => setPublishOpen(false)} aria-label={t("common.close")} className="rounded-md p-1 text-[#5B6478] hover:bg-[#F7F8FA]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-4 flex flex-col gap-1 text-sm">
              <span className="font-medium text-[#1C2438]">{t("schedule.publishDepartment")}</span>
              <select value={publishDept} onChange={(e) => setPublishDept(e.target.value)} className="rounded-lg border border-[#DADEE5] bg-white px-3 py-2 text-sm">
                <option value="">{t("schedule.allDepartmentsLong")}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
                {hasNoDepartment && <option value={NONE}>{t("schedule.noDepartment")}</option>}
              </select>
            </label>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-[#1C2438]">{t("schedule.visibilityLabel")}</legend>
              <div className="mt-2 space-y-2">
                {[
                  { value: false, icon: Lock, title: t("schedule.visibilityPrivate"), help: t("schedule.visibilityPrivateHelp") },
                  { value: true, icon: Users, title: t("schedule.visibilityTeam"), help: t("schedule.visibilityTeamHelp") },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const checked = teamVisible === opt.value;
                  return (
                    <label
                      key={String(opt.value)}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? "border-[#2F6F5E] bg-[#F3F9F7]" : "border-[#E2E4E9] hover:bg-[#F7F8FA]"}`}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        checked={checked}
                        onChange={() => setTeamVisible(opt.value)}
                        className="mt-1 accent-[#2F6F5E]"
                      />
                      <span>
                        <span className="flex items-center gap-1.5 text-sm font-medium text-[#1C2438]">
                          <Icon className="h-4 w-4 text-[#2F6F5E]" /> {opt.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-[#5B6478]">{opt.help}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <p className="mt-4 rounded-lg bg-[#F7F8FA] px-3 py-2 text-xs leading-relaxed text-[#5B6478]">
              {scopeDrafts.length > 0
                ? t("schedule.publishSummary", { count: scopeDrafts.length, people: scopePeople })
                : scopeShifts.length > 0
                  ? t("schedule.publishNothingNew")
                  : t("schedule.publishEmpty")}
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPublishOpen(false)} className="rounded-lg px-3 py-2 text-sm text-[#5B6478] hover:bg-[#F7F8FA]">
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={busy !== null || scopeShifts.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {scopeDrafts.length > 0 ? t("schedule.publishConfirm") : t("schedule.saveVisibility")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fenêtre d'ajout / modification */}
      {editor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1C2438]/40 p-4 sm:items-center" onClick={() => busy === null && setEditor(null)}>
          <form
            onSubmit={save}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md animate-scale-in rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#1C2438]">{editor.id ? t("schedule.editShift") : t("schedule.addShift")}</h2>
              </div>
              <button type="button" onClick={() => setEditor(null)} aria-label={t("common.close")} className="rounded-md p-1 text-[#5B6478] hover:bg-[#F7F8FA]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="col-span-2 flex flex-col gap-1 text-sm">
                <span className="font-medium text-[#1C2438]">{t("schedule.employee")}</span>
                <select
                  value={editor.userId}
                  onChange={(e) => setEditor({ ...editor, userId: e.target.value })}
                  className="rounded-lg border border-[#DADEE5] bg-white px-3 py-2.5 text-base"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-sm">
                <span className="font-medium text-[#1C2438]">{t("schedule.day")}</span>
                <select
                  value={editor.date}
                  onChange={(e) => setEditor({ ...editor, date: e.target.value })}
                  className="rounded-lg border border-[#DADEE5] bg-white px-3 py-2 text-sm"
                >
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {formatDate(`${d}T12:00:00Z`, { weekday: "long", day: "numeric", month: "long" })}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-[#1C2438]">{t("schedule.start")}</span>
                <input
                  type="time"
                  required
                  value={editor.start}
                  onChange={(e) => setEditor({ ...editor, start: e.target.value })}
                  className="rounded-lg border border-[#DADEE5] px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-[#1C2438]">{t("schedule.end")}</span>
                <input
                  type="time"
                  required
                  value={editor.end}
                  onChange={(e) => setEditor({ ...editor, end: e.target.value })}
                  className="rounded-lg border border-[#DADEE5] px-3 py-2 text-sm"
                />
              </label>
              <div className="col-span-2 -mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-[#5B6478]">{t("schedule.quickTimes")}</span>
                {[
                  { label: t("schedule.presetMorning"), start: "08:00", end: "16:00" },
                  { label: t("schedule.presetDay"), start: "09:00", end: "17:00" },
                  { label: t("schedule.presetEvening"), start: "16:00", end: "00:00" },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setEditor({ ...editor, start: p.start, end: p.end })}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      editor.start === p.start && editor.end === p.end ? "border-[#2F6F5E] bg-[#E7F3EF] text-[#265A4C]" : "border-[#DADEE5] text-[#1C2438] hover:bg-[#F7F8FA]"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {editor.end && editor.start && editor.end <= editor.start && (
                <p className="col-span-2 -mt-1 text-xs text-[#5B6478]">{t("schedule.endsNextDay")}</p>
              )}
              <label className="col-span-2 flex flex-col gap-1 text-sm">
                <span className="font-medium text-[#1C2438]">
                  {t("schedule.position")} <span className="font-normal text-[#9AA1B2]">{t("schedule.optional")}</span>
                </span>
                <input
                  list="schedule-positions"
                  value={editor.position}
                  maxLength={60}
                  onChange={(e) => setEditor({ ...editor, position: e.target.value })}
                  placeholder={t("schedule.positionPlaceholder")}
                  className="rounded-lg border border-[#DADEE5] px-3 py-2 text-sm"
                />
                <datalist id="schedule-positions">
                  {positions.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-sm">
                <span className="font-medium text-[#1C2438]">
                  {t("schedule.note")} <span className="font-normal text-[#9AA1B2]">{t("schedule.optional")}</span>
                </span>
                <input
                  value={editor.note}
                  maxLength={300}
                  onChange={(e) => setEditor({ ...editor, note: e.target.value })}
                  placeholder={t("schedule.notePlaceholder")}
                  className="rounded-lg border border-[#DADEE5] px-3 py-2 text-sm"
                />
              </label>
            </div>

            {error && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-[#8A3B3B]" role="alert">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}

            <div className="mt-5 flex items-center justify-between gap-2">
              {editor.id ? (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#8A3B3B] px-3 py-2 text-sm font-medium text-[#8A3B3B] hover:bg-[#FDECEC] disabled:opacity-50"
                >
                  {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {t("schedule.delete")}
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditor(null)} className="rounded-lg px-3 py-2 text-sm text-[#5B6478] hover:bg-[#F7F8FA]">
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#2F6F5E] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
