"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarDays, CheckCircle2, Loader2, Plus } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

// Paramètres > Types de congés (admins, AUDIT.md 7.30) : nom, jours par année
// (vide = non décompté), couleur, actif ; début de l'année de congés.

export type LeaveTypeSetting = {
  id: string;
  defaultLabel: string | null; // nom traduit d'un type par défaut (null = type personnalisé)
  name: string;
  daysPerYear: number | null;
  color: string;
  isActive: boolean;
};

const COLORS = ["#1F8A6E", "#E0A43A", "#3F6FB0", "#C9542C", "#8B6BC9", "#2A9FB0"];
const cell = "rounded-lg border border-[#E2E4E9] px-2 py-1.5 text-sm focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12";

function Row({ type }: { type: LeaveTypeSetting }) {
  const router = useRouter();
  const { t, tx } = useI18n();
  const [name, setName] = useState(type.name);
  const [days, setDays] = useState(type.daysPerYear == null ? "" : String(type.daysPerYear));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save(patch: Record<string, unknown>) {
    setState("saving");
    setError("");
    try {
      const res = await fetch(`/api/leave/types/${type.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("leave.settings.saveFailed"));
      setState("saved");
      router.refresh();
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    }
  }

  const dirty = name.trim() !== type.name || days.trim() !== (type.daysPerYear == null ? "" : String(type.daysPerYear));

  return (
    <li className={`flex flex-wrap items-center gap-2 py-2.5 ${type.isActive ? "" : "opacity-60"}`}>
      <input
        value={name}
        onChange={(e) => { setName(e.target.value); setState("idle"); }}
        placeholder={type.defaultLabel ?? ""}
        maxLength={60}
        aria-label={t("leave.settings.name")}
        className={`${cell} min-w-0 flex-1 basis-40`}
      />
      <input
        value={days}
        onChange={(e) => { setDays(e.target.value); setState("idle"); }}
        inputMode="decimal"
        placeholder="—"
        aria-label={t("leave.settings.daysPerYear")}
        title={t("leave.settings.notTrackedHint")}
        className={`${cell} w-20 text-right`}
      />
      <span className="flex gap-1" role="radiogroup" aria-label={t("leave.settings.color")}>
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={type.color === c}
            aria-label={c}
            onClick={() => save({ color: c })}
            className={`h-5 w-5 rounded-full border-2 ${type.color === c ? "border-[#1C2438]" : "border-white"}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </span>
      <label className="flex items-center gap-1 text-xs text-[#5B6478]">
        <input
          type="checkbox"
          checked={type.isActive}
          onChange={(e) => save({ isActive: e.target.checked })}
          className="accent-[#2F6F5E]"
        />
        {t("leave.settings.active")}
      </label>
      {dirty && (
        <button
          type="button"
          onClick={() => save({ name: name.trim(), daysPerYear: days.trim() })}
          className="rounded-md bg-[#2F6F5E] px-2.5 py-1.5 text-xs font-medium text-white"
        >
          {t("common.save")}
        </button>
      )}
      {state === "saving" && <Loader2 className="h-4 w-4 animate-spin text-[#5B6478]" />}
      {state === "saved" && !dirty && <CheckCircle2 className="h-4 w-4 text-[#2F6F5E]" aria-label={t("leave.settings.saved")} />}
      {state === "error" && (
        <span className="flex basis-full items-center gap-1 text-xs text-[#8A3B3B]">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </span>
      )}
    </li>
  );
}

export function LeaveTypesCard({ types, yearStartMonth }: { types: LeaveTypeSetting[]; yearStartMonth: number }) {
  const router = useRouter();
  const { t, tx, locale } = useI18n();
  const [newName, setNewName] = useState("");
  const [newDays, setNewDays] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(yearStartMonth);
  const [monthState, setMonthState] = useState<"idle" | "saving" | "saved">("idle");

  const monthNames = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(2026, i, 1)).toLocaleDateString(locale === "en" ? "en-CA" : "fr-CA", { month: "long", timeZone: "UTC" })
  );

  async function add() {
    setAdding(true);
    setError("");
    try {
      const res = await fetch("/api/leave/types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, daysPerYear: newDays, color: COLORS[types.length % COLORS.length] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("leave.settings.saveFailed"));
      setNewName("");
      setNewDays("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    } finally {
      setAdding(false);
    }
  }

  async function saveMonth(value: number) {
    setMonth(value);
    setMonthState("saving");
    const res = await fetch("/api/leave/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yearStartMonth: value }),
    }).catch(() => null);
    setMonthState(res?.ok ? "saved" : "idle");
    router.refresh();
  }

  return (
    <div className="max-w-3xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <h2 className="flex items-center gap-2 text-sm font-medium text-[#1C2438]">
        <CalendarDays className="h-4 w-4 text-[#8A6A1C]" strokeWidth={1.9} /> {t("leave.settings.title")}
      </h2>
      <p className="mt-1 text-sm text-[#5B6478]">{t("leave.settings.description")}</p>
      <p className="mt-1 text-xs text-[#9AA1B2]">{t("leave.settings.defaultsHint")}</p>

      <div className="mt-4 flex gap-2 text-xs font-medium text-[#5B6478]">
        <span className="flex-1 basis-40">{t("leave.settings.name")}</span>
        <span className="w-20 text-right">{t("leave.settings.daysPerYear")}</span>
        <span className="w-[136px]">{t("leave.settings.color")}</span>
      </div>
      <ul className="divide-y divide-[#E4E7EE]">
        {types.map((type) => (
          <Row key={type.id + type.name + type.daysPerYear + type.color + type.isActive} type={type} />
        ))}
      </ul>
      <p className="mt-1 text-xs text-[#9AA1B2]">{t("leave.settings.notTrackedHint")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E4E7EE] pt-4">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60} placeholder={t("leave.settings.newNamePlaceholder")} className={`${cell} min-w-0 flex-1 basis-40`} />
        <input value={newDays} onChange={(e) => setNewDays(e.target.value)} inputMode="decimal" placeholder="—" aria-label={t("leave.settings.daysPerYear")} className={`${cell} w-20 text-right`} />
        <button
          type="button"
          onClick={add}
          disabled={!newName.trim() || adding}
          className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t("leave.settings.add")}
        </button>
        {error && (
          <span className="flex basis-full items-center gap-1 text-xs text-[#8A3B3B]">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </span>
        )}
      </div>

      <label className="mt-5 block border-t border-[#E4E7EE] pt-4 text-sm font-medium text-[#1C2438]">
        {t("leave.settings.yearStart")}
        <span className="mt-1 flex items-center gap-2">
          <select value={month} onChange={(e) => saveMonth(Number(e.target.value))} className={`${cell} capitalize`}>
            {monthNames.map((m, i) => (
              <option key={i} value={i + 1}>{t("leave.settings.monthOption", { month: m })}</option>
            ))}
          </select>
          {monthState === "saving" && <Loader2 className="h-4 w-4 animate-spin text-[#5B6478]" />}
          {monthState === "saved" && <CheckCircle2 className="h-4 w-4 text-[#2F6F5E]" />}
        </span>
        <span className="mt-1 block text-xs font-normal text-[#5B6478]">{t("leave.settings.yearStartHelp")}</span>
      </label>
    </div>
  );
}
