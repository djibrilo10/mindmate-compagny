"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

// Fenêtre UNIQUE « Dans quelle équipe travailles-tu ? » (AUDIT.md 7.34) :
// pour les comptes créés avant que l'admin principal définisse les
// départements. Bloquante (pas de bouton fermer) : un seul clic suffit.
// Ensuite, seuls les admins peuvent changer le département.
export function DepartmentPrompt({
  organizationName,
  departments,
}: {
  organizationName: string;
  departments: { id: string; name: string; color: string }[];
}) {
  const router = useRouter();
  const { t, tx } = useI18n();
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/me/department", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: selected }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C2438]/40 px-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="dept-prompt-title">
      <div className="w-full max-w-md animate-scale-in rounded-2xl bg-white p-6 shadow-xl">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF0FB] text-[#2F5FA6]">
          <Building2 className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <h2 id="dept-prompt-title" className="mt-4 font-[family-name:var(--font-display)] text-xl text-[#1C2438]">
          {t("departments.prompt.title")}
        </h2>
        <p className="mt-1 text-sm text-[#5B6478]">{t("departments.prompt.body", { org: organizationName })}</p>

        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto" role="radiogroup">
          {departments.map((d) => (
            <label
              key={d.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-base transition-colors ${
                selected === d.id ? "border-[#2F6F5E] bg-[#E7F3EF]" : "border-[#E2E4E9] hover:border-[#C7CBD6]"
              }`}
            >
              <input type="radio" name="department" checked={selected === d.id} onChange={() => setSelected(d.id)} className="h-4 w-4 accent-[#2F6F5E]" />
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
              <span className="text-[#1C2438]">{d.name}</span>
            </label>
          ))}
        </div>

        {error && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-[#8A3B3B]" role="alert">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}

        <button
          type="button"
          onClick={confirm}
          disabled={!selected || saving}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("departments.prompt.confirm")}
        </button>
        <p className="mt-2 text-center text-xs text-[#9AA1B2]">{t("departments.prompt.hint")}</p>
      </div>
    </div>
  );
}
