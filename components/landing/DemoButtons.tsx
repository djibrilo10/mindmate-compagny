"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { ChevronRight, Loader2, User, Users } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { DemoRole } from "@/lib/demo";

// « Explorez la démo » (AUDIT.md 7.43) : connexion sans mot de passe à l'un
// des deux comptes de l'entreprise fictive, puis ouverture du tableau de bord.
export function DemoButtons() {
  const { t } = useI18n();
  const [busy, setBusy] = useState<DemoRole | null>(null);
  const [failed, setFailed] = useState(false);

  async function open(role: DemoRole) {
    setBusy(role);
    setFailed(false);
    try {
      const res = await signIn("demo", { role, redirect: false });
      if (!res || res.error || !res.ok) throw new Error();
      window.location.href = role === "manager" ? "/dashboard" : "/dashboard/schedule";
    } catch {
      setFailed(true);
      setBusy(null);
    }
  }

  const options = [
    { role: "manager" as const, icon: Users, label: t("landing.demoPicker.manager"), help: t("landing.demoPicker.managerHelp") },
    { role: "employee" as const, icon: User, label: t("landing.demoPicker.employee"), help: t("landing.demoPicker.employeeHelp") },
  ];

  return (
    <div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.role}
            type="button"
            onClick={() => open(o.role)}
            disabled={busy !== null}
            className="group flex items-center gap-3 rounded-2xl border border-[#2F6F5E]/25 bg-white p-3.5 text-left shadow-sm transition hover:border-[#2F6F5E] hover:shadow-md disabled:opacity-70"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#2F6F5E] text-white">
              {busy === o.role ? <Loader2 className="h-5 w-5 animate-spin" /> : <o.icon className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-[#1C2438]">{busy === o.role ? t("landing.demoPicker.opening") : o.label}</span>
              <span className="block text-xs text-[#5B6478]">{o.help}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[#2F6F5E] transition group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-[#8A3B3B]">
          {t("landing.demoPicker.unavailable")}
        </p>
      )}
    </div>
  );
}
