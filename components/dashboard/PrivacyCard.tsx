"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { LocalDateTime } from "@/components/dashboard/LocalDateTime";
import { useI18n } from "@/components/i18n/I18nProvider";
import { formatDuration } from "@/lib/i18n/format";

// ------------------------------------------------------------
// Paramètres > Confidentialité (Loi 25, voir AUDIT.md 7.28).
// Tous les admins voient les réglages ; seul l'admin PRINCIPAL les modifie.
// ------------------------------------------------------------

// Aucune durée par défaut : l'admin principal choisit (AUDIT.md 7.28).
const OPTIONS = [6, 12, 24, 36, 60].map((months) => ({ months }));

const inputClass =
  "mt-1 w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12 disabled:bg-[#F7F8FA] disabled:text-[#5B6478]";

export function PrivacyCard({
  isPrimary,
  months: initialMonths,
  officerName: initialName,
  officerEmail: initialEmail,
  defaultOfficerName,
  lastPurgeAt,
}: {
  isPrimary: boolean;
  months: number | null;
  officerName: string;
  officerEmail: string;
  defaultOfficerName: string;
  lastPurgeAt: string | null;
}) {
  const router = useRouter();
  const { t, tx } = useI18n();
  const [months, setMonths] = useState<number | null>(initialMonths);
  const [officerName, setOfficerName] = useState(initialName);
  const [officerEmail, setOfficerEmail] = useState(initialEmail);
  const [status, setStatus] = useState<"idle" | "loading" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  const dirty = months !== initialMonths || officerName.trim() !== initialName || officerEmail.trim() !== initialEmail;
  const shortening = initialMonths !== null && months !== null && months < initialMonths;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dirty || months === null) return;
    // Raccourcir la durée efface des données à la prochaine nuit : on demande confirmation.
    if (shortening && !confirming) {
      setConfirming(true);
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/organization/privacy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataRetentionMonths: months,
          privacyOfficerName: officerName.trim(),
          privacyOfficerEmail: officerEmail.trim(),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("settings.privacy.saveFailed"));
      setStatus("saved");
      setConfirming(false);
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-2xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
    >
      <h2 className="flex items-center gap-2 text-sm font-medium text-[#1C2438]">
        <ShieldCheck className="h-4 w-4 text-[#2A5A8A]" /> {t("settings.privacy.title")}
      </h2>
      <p className="mt-1 text-sm text-[#5B6478]">{t("settings.privacy.description")}</p>

      {initialMonths === null && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-[#FDF3E3] px-3 py-2 text-sm text-[#6B5215]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {isPrimary ? t("settings.privacy.notChosenPrimary") : t("settings.privacy.notChosenOther")}
        </p>
      )}

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-[#1C2438]">{t("settings.privacy.retentionLegend")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {OPTIONS.map((o) => (
            <label
              key={o.months}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                months === o.months ? "border-[#2F6F5E] bg-[#E7F3EF]" : "border-[#E2E4E9]"
              } ${isPrimary ? "cursor-pointer hover:border-[#C7CBD6]" : "opacity-80"}`}
            >
              <input
                type="radio"
                name="retention"
                checked={months === o.months}
                disabled={!isPrimary}
                onChange={() => {
                  setMonths(o.months);
                  setConfirming(false);
                  setStatus("idle");
                }}
                className="accent-[#2F6F5E]"
              />
              {formatDuration(t, o.months)}
            </label>
          ))}
        </div>
        {months === 6 && (
          <p className="mt-2 text-xs text-[#6B5215]">
            {t("settings.privacy.sixMonthsWarning")}
          </p>
        )}
        <p className="mt-2 text-xs text-[#5B6478]">
          {t("settings.privacy.retentionHelp")}
        </p>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-[#1C2438]">
          {t("settings.privacy.officerLegend")}
        </legend>
        <p className="mt-0.5 text-xs text-[#5B6478]">{t("settings.privacy.officerHelp", { name: defaultOfficerName })}</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm text-[#1C2438]">
            {t("settings.privacy.officerName")}
            <input
              value={officerName}
              onChange={(e) => {
                setOfficerName(e.target.value);
                setStatus("idle");
              }}
              disabled={!isPrimary}
              maxLength={120}
              placeholder={defaultOfficerName}
              className={inputClass}
            />
          </label>
          <label className="block text-sm text-[#1C2438]">
            {t("settings.privacy.officerEmail")} <span className="text-[#9AA1B2]">{t("settings.privacy.optional")}</span>
            <input
              type="email"
              value={officerEmail}
              onChange={(e) => {
                setOfficerEmail(e.target.value);
                setStatus("idle");
              }}
              disabled={!isPrimary}
              maxLength={200}
              placeholder={t("settings.privacy.emailPlaceholder")}
              className={inputClass}
            />
          </label>
        </div>
      </fieldset>

      {confirming && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-[#FDF3E3] px-3 py-2 text-sm text-[#6B5215]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("settings.privacy.shortenWarning", { duration: months ? formatDuration(t, months) : "" })}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#E4E7EE] pt-4">
        {isPrimary ? (
          <>
            <button
              type="submit"
              disabled={!dirty || months === null || status === "loading"}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-50 ${
                confirming ? "bg-[#C2542C] hover:bg-[#A8451F]" : "bg-gradient-to-br from-[#3D8C76] to-[#265A4C]"
              }`}
            >
              {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
              {confirming ? t("settings.privacy.confirmDuration") : t("common.save")}
            </button>
            {confirming && (
              <button type="button" onClick={() => setConfirming(false)} className="text-sm text-[#5B6478] hover:text-[#1C2438]">
                {t("common.cancel")}
              </button>
            )}
            {status === "saved" && !dirty && (
              <span className="inline-flex items-center gap-1 text-sm text-[#2F6F5E]">
                <CheckCircle2 className="h-4 w-4" /> {t("common.saved")}
              </span>
            )}
            {status === "error" && (
              <span className="inline-flex items-center gap-1 text-sm text-[#8A3B3B]">
                <AlertCircle className="h-4 w-4" /> {error}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-[#9AA1B2]">{t("settings.privacy.onlyPrimary")}</span>
        )}
        <span className="ml-auto text-xs text-[#9AA1B2]">
          {t("settings.privacy.lastPurge")}{" "}
          {initialMonths === null ? (
            t("settings.privacy.waitingChoice")
          ) : lastPurgeAt ? (
            <LocalDateTime iso={lastPurgeAt} withTime={false} />
          ) : (
            t("settings.privacy.notRunYet")
          )}
        </span>
      </div>
    </form>
  );
}
