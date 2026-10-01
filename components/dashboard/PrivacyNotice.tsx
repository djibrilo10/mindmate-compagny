"use client";

import { ShieldCheck } from "lucide-react";
import type { PrivacyInfo } from "@/lib/privacy";
import { useI18n } from "@/components/i18n/I18nProvider";
import { formatDuration } from "@/lib/i18n/format";

// Avis de confidentialité (Loi 25, AUDIT.md 7.28) affiché AVANT une collecte
// nominative. L'envoi du formulaire reste bloqué tant que « J'ai compris »
// n'est pas coché ; le serveur refuse aussi l'envoi sans cette case.
// Textes : lib/i18n/messages (privacyNotice.*), FR/EN (AUDIT.md 7.29).

export function PrivacyNotice({
  info,
  purpose,
  accepted,
  onChange,
}: {
  info: PrivacyInfo;
  purpose: "departure" | "survey";
  accepted: boolean;
  onChange: (value: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border border-[#C9DCF0] bg-[#F2F7FC] px-4 py-3 text-sm text-[#1C2438]">
      <p className="flex items-center gap-2 font-medium text-[#2A5A8A]">
        <ShieldCheck className="h-4 w-4 shrink-0" /> {t("privacyNotice.title")}
      </p>
      <ul className="mt-2 space-y-1 text-[#3E4A61]">
        <li>
          <strong className="font-medium text-[#1C2438]">{t("privacyNotice.whoLabel")}</strong>{" "}
          {t("privacyNotice.who", { org: info.organizationName })}
        </li>
        <li>
          <strong className="font-medium text-[#1C2438]">{t("privacyNotice.purposeLabel")}</strong>{" "}
          {purpose === "departure" ? t("privacyNotice.departurePurpose") : t("privacyNotice.surveyPurpose")}
        </li>
        <li>
          <strong className="font-medium text-[#1C2438]">{t("privacyNotice.durationLabel")}</strong>{" "}
          {info.retentionMonths
            ? t("privacyNotice.durationSet", { duration: formatDuration(t, info.retentionMonths) })
            : t("privacyNotice.durationNotSet")}
        </li>
        <li>
          <strong className="font-medium text-[#1C2438]">{t("privacyNotice.contactLabel")}</strong>{" "}
          {info.officerName || t("privacyNotice.defaultOfficer")}
          {info.officerEmail && (
            <>
              {" "}
              (
              <a href={`mailto:${info.officerEmail}`} className="text-[#2A5A8A] underline">
                {info.officerEmail}
              </a>
              )
            </>
          )}
          {t("privacyNotice.officerSuffix")}
        </li>
      </ul>
      <label className="mt-3 flex cursor-pointer items-center gap-2 font-medium">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-[#2F6F5E]"
        />
        {t("privacyNotice.understood")}
      </label>
    </div>
  );
}
