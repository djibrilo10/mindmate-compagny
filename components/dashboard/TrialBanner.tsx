"use client";

import Link from "next/link";
import { Hourglass } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

// Bandeau « essai gratuit » pour les admins de l'entreprise (AUDIT.md 7.44) :
// les 7 derniers jours, puis une fois l'essai terminé. Mène à Paramètres,
// où l'admin principal peut écrire au propriétaire (« Contacter Djibril »).
export function TrialBanner({ ended, daysLeft, endsAt }: { ended: boolean; daysLeft: number; endsAt: string }) {
  const { t, formatDate } = useI18n();
  const date = formatDate(endsAt, { day: "numeric", month: "long" });
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5 text-sm sm:px-8 ${
        ended ? "border-[#C2542C]/30 bg-[#FDECEC] text-[#7A2F2F]" : "border-[#E0A43A]/40 bg-[#FFF6E5] text-[#6B4A10]"
      }`}
    >
      <p className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <Hourglass className="mt-0.5 h-4 w-4 shrink-0" />
        {ended ? t("trial.ended") : t("trial.endingSoon", { count: daysLeft, date })}
      </p>
      <Link href="/dashboard/settings" className="rounded-lg bg-[#2F6F5E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#275D4F]">
        {t("trial.contact")}
      </Link>
    </div>
  );
}
