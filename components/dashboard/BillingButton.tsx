"use client";

import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

// Bouton qui ouvre Stripe (AUDIT.md 7.45) : « checkout » = page de paiement
// pour activer l'abonnement ; « portal » = portail client (carte, factures).
export function BillingButton({
  mode,
  label,
  variant = "primary",
}: {
  mode: "checkout" | "portal";
  label: string;
  variant?: "primary" | "secondary" | "small";
}) {
  const { t, tx } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/billing/${mode}`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
      setBusy(false);
    }
  }

  const styles = {
    primary: "rounded-xl bg-[#2F6F5E] px-4 py-3 text-base font-semibold text-white hover:bg-[#275D4F]",
    secondary: "rounded-xl border border-[#DADEE5] bg-white px-4 py-3 text-sm font-medium text-[#1C2438] hover:bg-[#F7F8FA]",
    small: "rounded-lg bg-[#2F6F5E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#275D4F]",
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={go} disabled={busy} className={`inline-flex items-center justify-center gap-2 disabled:opacity-60 ${styles[variant]}`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : variant !== "small" && <CreditCard className="h-4 w-4" />}
        {label}
      </button>
      {error && (
        <span role="alert" className="text-xs text-[#8A3B3B]">
          {error}
        </span>
      )}
    </span>
  );
}
