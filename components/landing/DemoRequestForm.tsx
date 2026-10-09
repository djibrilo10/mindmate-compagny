"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { COMPANY_SIZES } from "@/lib/validations/demo-request";

// Formulaire « Demander une démo » de la page d'accueil (AUDIT.md 7.43).
// Le champ `website` est un piège invisible pour les robots.

const inputClass =
  "w-full rounded-xl border border-[#DADEE5] bg-white px-3.5 py-3 text-base text-[#1C2438] outline-none transition focus:border-[#2F6F5E] focus:ring-2 focus:ring-[#2F6F5E]/20 sm:text-sm";

export function DemoRequestForm() {
  const { t, tx } = useI18n();
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", companySize: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.unknownError"));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-2xl bg-[#E7F3EF] p-5 text-[#1C2438]">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[#2F6F5E]" />
        <p className="text-base">{t("landing.form.sent")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3.5 sm:grid-cols-2" noValidate>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-[#1C2438]">
        {t("landing.form.name")}
        <input required autoComplete="name" value={form.name} onChange={set("name")} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-[#1C2438]">
        {t("landing.form.company")}
        <input required autoComplete="organization" value={form.company} onChange={set("company")} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-[#1C2438]">
        {t("landing.form.email")}
        <input required type="email" autoComplete="email" value={form.email} onChange={set("email")} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-[#1C2438]">
        <span>
          {t("landing.form.phone")} <span className="font-normal text-[#9AA1B2]">{t("landing.form.optional")}</span>
        </span>
        <input type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-[#1C2438] sm:col-span-2">
        {t("landing.form.size")}
        <select value={form.companySize} onChange={set("companySize")} className={inputClass}>
          <option value="">{t("landing.form.sizeChoose")}</option>
          {COMPANY_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-[#1C2438] sm:col-span-2">
        <span>
          {t("landing.form.message")} <span className="font-normal text-[#9AA1B2]">{t("landing.form.optional")}</span>
        </span>
        <textarea
          rows={3}
          value={form.message}
          onChange={set("message")}
          placeholder={t("landing.form.messagePlaceholder")}
          className={`${inputClass} resize-y`}
        />
      </label>
      {/* Piège à robots : invisible pour les personnes, ignoré par les lecteurs d'écran. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={form.website}
        onChange={set("website")}
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />
      {error && (
        <p role="alert" className="text-sm text-[#8A3B3B] sm:col-span-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#2F6F5E] px-5 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-[#275D4F] disabled:opacity-60 sm:col-span-2"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        {t("landing.form.submit")}
      </button>
    </form>
  );
}
