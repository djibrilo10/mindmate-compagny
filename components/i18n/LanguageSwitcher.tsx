"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { useI18n } from "./I18nProvider";

// Bouton FR | EN (barre du haut, pages de connexion). Enregistre le choix
// (cookie + compte si connecté) puis recharge la page dans la bonne langue.
export function LanguageSwitcher({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState<Locale | null>(null);

  async function choose(next: Locale) {
    if (next === locale || saving) return;
    setSaving(next);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
    } finally {
      setSaving(null);
      startTransition(() => router.refresh());
    }
  }

  const busy = pending || saving !== null;
  return (
    <div
      role="group"
      aria-label={t("language.switchLabel")}
      className={`inline-flex items-center gap-1 rounded-md border p-0.5 text-xs font-medium ${
        tone === "dark" ? "border-white/15 text-[#B7BECC]" : "border-[#DADEE5] text-[#5B6478]"
      } ${busy ? "opacity-60" : ""}`}
    >
      <Languages className="ml-1 h-3.5 w-3.5" strokeWidth={1.9} aria-hidden />
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => choose(code)}
          disabled={busy}
          aria-pressed={code === locale}
          lang={code}
          title={t(code === "fr" ? "language.fr" : "language.en")}
          className={`rounded px-1.5 py-0.5 uppercase transition-colors ${
            code === locale
              ? "bg-[#2F6F5E] text-white"
              : tone === "dark"
                ? "hover:text-white"
                : "hover:text-[#1C2438]"
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
