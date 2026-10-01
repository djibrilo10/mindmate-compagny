"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Languages, Loader2 } from "lucide-react";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n/config";
import { useI18n } from "@/components/i18n/I18nProvider";

// Paramètres > Langue (voir AUDIT.md 7.29) : langue par défaut de l'entreprise,
// utilisée par les comptes qui n'ont pas choisi la leur (bouton FR / EN).
export function LanguageCard({ initialLocale }: { initialLocale: Locale }) {
  const { t, tx } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState<Locale>(initialLocale);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function choose(next: Locale) {
    if (next === value || status === "saving") return;
    const previous = value;
    setValue(next);
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/organization/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultLocale: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("settings.language.saveFailed"));
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setValue(previous);
      setStatus("error");
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    }
  }

  return (
    <div className="max-w-xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <h2 className="flex items-center gap-2 text-sm font-medium text-[#1C2438]">
        <Languages className="h-4 w-4 text-[#2F6F5E]" strokeWidth={1.9} /> {t("settings.language.title")}
      </h2>
      <p className="mt-1 text-sm text-[#5B6478]">{t("settings.language.description")}</p>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-[#1C2438]">{t("settings.language.defaultLabel")}</legend>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {LOCALES.map((code) => (
            <label
              key={code}
              lang={code}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:border-[#C7CBD6] ${
                value === code ? "border-[#2F6F5E] bg-[#E7F3EF]" : "border-[#E2E4E9]"
              }`}
            >
              <input
                type="radio"
                name="defaultLocale"
                checked={value === code}
                onChange={() => choose(code)}
                disabled={status === "saving"}
                className="accent-[#2F6F5E]"
              />
              {LOCALE_NAMES[code]}
            </label>
          ))}
          {status === "saving" && <Loader2 className="h-4 w-4 animate-spin text-[#5B6478]" />}
          {status === "saved" && (
            <span className="inline-flex items-center gap-1 text-sm text-[#2F6F5E]">
              <CheckCircle2 className="h-4 w-4" /> {t("common.saved")}
            </span>
          )}
          {status === "error" && (
            <span className="inline-flex items-center gap-1 text-sm text-[#8A3B3B]">
              <AlertCircle className="h-4 w-4" /> {error}
            </span>
          )}
        </div>
      </fieldset>
    </div>
  );
}
