"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useI18n } from "@/components/i18n/I18nProvider";
import { DepartmentPrompt } from "./DepartmentPrompt";
import { DemoBanner } from "./DemoBanner";
import { TrialBanner } from "./TrialBanner";
import type { BillingBanner } from "@/lib/billing";

type Role = "SUPER_ADMIN" | "ORG_ADMIN" | "MANAGER" | "EMPLOYEE";

type DashboardShellProps = {
  organizationName: string;
  userLabel: string;
  role: Role;
  unreadNotifications: number;
  department?: { name: string; color: string } | null;
  departmentPrompt?: { organizationName: string; departments: { id: string; name: string; color: string }[] } | null;
  isDemo?: boolean;
  logoVersion?: string;
  trialBanner?: BillingBanner | null;
  children: ReactNode;
};

export function DashboardShell({
  organizationName,
  userLabel,
  role,
  unreadNotifications,
  department,
  departmentPrompt,
  isDemo = false,
  logoVersion = "",
  trialBanner = null,
  children,
}: DashboardShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { t } = useI18n();

  return (
    <div className="min-h-screen bg-[#F7F8FA] lg:grid lg:grid-cols-[240px_1fr]">
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-gradient-to-b from-[#1C2438] to-[#182032] shadow-xl transition-transform duration-300 ease-out lg:static lg:w-auto lg:translate-x-0 lg:shadow-none ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 pb-4 pt-6">
          {/* Logo propre à CETTE organisation (voir AUDIT.md 7.19) — sert le
              logo par défaut de la plateforme tant qu'aucun n'a été
              téléversé par l'admin (voir GET /api/organization/logo). Fond
              blanc + grande taille : les logos clients sont le plus souvent
              conçus pour un fond clair, et doivent rester lisibles quelle
              que soit leur forme (large, carré, etc.) — d'où object-contain
              dans une hauteur fixe plutôt qu'un petit badge carré. */}
          <div className="flex h-16 items-center justify-center rounded-xl bg-white px-3 py-2">
            {/* ?v= : entreprise + date du logo. Sans ça, le navigateur garde en
                cache le logo d'une AUTRE entreprise ouverte avant (même adresse). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/organization/logo?v=${logoVersion}`} alt="" aria-hidden className="h-full w-full object-contain" />
          </div>
          <p className="mt-3 text-center text-xs font-medium uppercase tracking-wider text-[#8891A5]">
            {t("shell.portal")}
          </p>
        </div>
        <Sidebar onNavigate={() => setIsSidebarOpen(false)} role={role} />
      </aside>

      {isSidebarOpen && (
        <button
          aria-label={t("shell.closeMenu")}
          onClick={() => setIsSidebarOpen(false)}
          className="animate-fade-in fixed inset-0 z-20 bg-black/30 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <div className="flex min-h-screen flex-col">
        <Topbar
          organizationName={organizationName}
          userLabel={userLabel}
          unreadNotifications={unreadNotifications}
          department={department ?? null}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        />
        {isDemo && <DemoBanner />}
        {trialBanner && <TrialBanner banner={trialBanner} />}
        <main className="flex-1 px-4 py-8 sm:px-8">{children}</main>
        {departmentPrompt && <DepartmentPrompt {...departmentPrompt} />}
      </div>
    </div>
  );
}
