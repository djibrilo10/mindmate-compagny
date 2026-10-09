"use client";

import { signOut } from "next-auth/react";
import { Eye } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

// Bandeau affiché dans l'entreprise de démonstration (AUDIT.md 7.43) :
// rappelle que tout est fictif et en lecture seule, et ramène vers la page
// d'accueil (formulaire « Demander une démo ») en quittant la démo.
export function DemoBanner() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#E0A43A]/40 bg-[#FFF6E5] px-4 py-2.5 text-sm text-[#6B4A10] sm:px-8">
      <p className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <Eye className="mt-0.5 h-4 w-4 shrink-0" /> {t("demo.banner")}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/#demander-une-demo" })}
          className="rounded-lg bg-[#2F6F5E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#275D4F]"
        >
          {t("demo.request")}
        </button>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="rounded-lg border border-[#E0A43A]/50 bg-white px-3 py-1.5 text-xs font-medium text-[#6B4A10] hover:bg-[#FFFBF2]"
        >
          {t("demo.exit")}
        </button>
      </div>
    </div>
  );
}
