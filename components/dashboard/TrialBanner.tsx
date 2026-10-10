"use client";

import Link from "next/link";
import { Hourglass } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { BillingButton } from "./BillingButton";
import type { BillingBanner } from "@/lib/billing";

// Bandeau essai / paiement pour les admins de l'entreprise (AUDIT.md 7.44,
// 7.45). Paiement en ligne activé (canPay) : bouton qui ouvre Stripe.
// Sinon : lien vers Paramètres (« Contacter Djibril »).
export function TrialBanner({ banner }: { banner: BillingBanner }) {
  const { t, formatDate } = useI18n();
  const date = formatDate(banner.date, { day: "numeric", month: "long" });
  const urgent = banner.kind !== "trialEnding";

  let text: string;
  if (!banner.canPay) {
    text = banner.kind === "trialEnding" ? t("trial.endingSoon", { count: banner.daysLeft, date }) : t("trial.ended");
  } else if (banner.kind === "trialEnding") {
    text = t("billing.banner.trialEnding", { count: banner.daysLeft, date });
  } else {
    const key = { trialEnded: "billing.banner.trialEnded", pastDue: "billing.banner.pastDue", canceled: "billing.banner.canceled" } as const;
    text = t(key[banner.kind], { date });
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5 text-sm sm:px-8 ${
        urgent ? "border-[#C2542C]/30 bg-[#FDECEC] text-[#7A2F2F]" : "border-[#E0A43A]/40 bg-[#FFF6E5] text-[#6B4A10]"
      }`}
    >
      <p className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <Hourglass className="mt-0.5 h-4 w-4 shrink-0" />
        {text}
      </p>
      {banner.canPay ? (
        <BillingButton
          mode={banner.kind === "pastDue" ? "portal" : "checkout"}
          label={banner.kind === "pastDue" ? t("billing.banner.fix") : t("billing.banner.pay")}
          variant="small"
        />
      ) : (
        <Link href="/dashboard/settings" className="rounded-lg bg-[#2F6F5E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#275D4F]">
          {t("trial.contact")}
        </Link>
      )}
    </div>
  );
}
