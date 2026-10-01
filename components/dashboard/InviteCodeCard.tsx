"use client";

import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

export function InviteCodeCard({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const [confirmingRegen, setConfirmingRegen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, tx } = useI18n();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("settings.invite.copyFailed"));
    }
  }

  async function handleRegenerate() {
    if (!confirmingRegen) {
      setConfirmingRegen(true);
      return;
    }

    setIsRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/organization/invite-code", { method: "POST" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ? tx(data.error) : t("settings.invite.regenerateFailed"));
        return;
      }

      setCode(data.inviteCode);
    } catch {
      setError(t("common.serverUnreachable"));
    } finally {
      setIsRegenerating(false);
      setConfirmingRegen(false);
    }
  }

  return (
    <div className="max-w-xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <h2 className="text-sm font-medium text-[#1C2438]">{t("settings.invite.title")}</h2>
      <p className="mt-1 text-sm text-[#5B6478]">{t("settings.invite.description")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-lg bg-[#F3F5F8] px-4 py-2.5 font-mono text-lg tracking-wider text-[#1C2438]">
          {code || "—"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#DADEE5] px-3 py-2 text-sm font-medium text-[#1C2438] transition-colors hover:border-[#2F6F5E] hover:text-[#2F6F5E]"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? t("settings.invite.copied") : t("settings.invite.copy")}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-[#C2542C]" role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#E4E7EE] pt-4">
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={isRegenerating}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            confirmingRegen
              ? "bg-[#C2542C] text-white hover:bg-[#A8451F]"
              : "border border-[#DADEE5] text-[#1C2438] hover:border-[#C2542C] hover:text-[#C2542C]"
          }`}
        >
          <RefreshCw className={`h-4 w-4 ${isRegenerating ? "animate-spin" : ""}`} strokeWidth={1.9} />
          {isRegenerating
            ? t("settings.invite.regenerating")
            : confirmingRegen
              ? t("settings.invite.confirmRegenerate")
              : t("settings.invite.regenerate")}
        </button>
        {confirmingRegen && !isRegenerating && (
          <button
            type="button"
            onClick={() => setConfirmingRegen(false)}
            className="text-sm text-[#5B6478] hover:text-[#1C2438]"
          >
            {t("common.cancel")}
          </button>
        )}
      </div>
    </div>
  );
}
