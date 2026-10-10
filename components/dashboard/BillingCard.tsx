"use client";

import { CheckCircle2, CreditCard, Users } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { BillingButton } from "./BillingButton";

// Paramètres > Abonnement (AUDIT.md 7.45) : état de l'essai / de
// l'abonnement, nombre d'employés facturés, boutons vers Stripe.

export type BillingCardState = "trial" | "trialEnded" | "trialing" | "active" | "pastDue" | "canceled" | "none" | "manual";

export function BillingCard({
  state,
  daysLeft,
  date,
  employees,
  priceLabel,
  hasCustomer,
  thanks,
}: {
  state: BillingCardState;
  daysLeft: number | null;
  date: string | null;
  employees: number;
  priceLabel: string | null;
  hasCustomer: boolean;
  thanks: boolean;
}) {
  const { t, formatDate } = useI18n();
  const day = date ? formatDate(date, { day: "numeric", month: "long", year: "numeric" }) : "";

  const statusText = {
    trial: t("billing.statusTrial", { count: daysLeft ?? 0, date: day }),
    trialEnded: t("billing.statusTrialEnded"),
    trialing: t("billing.statusTrialing", { date: day }),
    active: t("billing.statusActive", { date: day }),
    pastDue: t("billing.statusPastDue", { date: day }),
    canceled: t("billing.statusCanceled", { date: day }),
    none: t("billing.statusNone"),
    manual: t("billing.statusManual"),
  }[state];

  const warning = state === "pastDue" || state === "canceled" || state === "trialEnded";
  const canSubscribe = ["trial", "trialEnded", "canceled", "none"].includes(state);

  return (
    <div className="max-w-xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-[#2F6F5E]" />
        <h2 className="text-base font-semibold text-[#1C2438]">{t("billing.cardTitle")}</h2>
      </div>

      {thanks && (
        <p role="status" className="mt-3 flex items-center gap-2 rounded-lg bg-[#E7F3EF] px-3 py-2 text-sm text-[#2F6F5E]">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {t("billing.thanks")}
        </p>
      )}

      <p className={`mt-3 text-sm ${warning ? "font-medium text-[#8A3B3B]" : "text-[#1C2438]"}`}>{statusText}</p>

      {state !== "manual" && (
        <div className="mt-3 rounded-lg bg-[#F7F8FA] px-3 py-2.5 text-sm text-[#5B6478]">
          <p className="flex items-center gap-1.5 font-medium text-[#1C2438]">
            <Users className="h-4 w-4 text-[#2F6F5E]" /> {t("billing.employees", { count: employees })}
          </p>
          {priceLabel && <p className="mt-0.5">{t("billing.price", { amount: priceLabel })}</p>}
          <p className="mt-1 text-xs">{t("billing.howItWorks")}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canSubscribe && <BillingButton mode="checkout" label={t("billing.subscribe")} />}
        {hasCustomer && (
          <BillingButton mode="portal" label={state === "pastDue" ? t("billing.banner.fix") : t("billing.manage")} variant={canSubscribe ? "secondary" : "primary"} />
        )}
      </div>
      {state === "trial" && <p className="mt-2 text-xs text-[#5B6478]">{t("billing.subscribeDuringTrial")}</p>}
    </div>
  );
}
