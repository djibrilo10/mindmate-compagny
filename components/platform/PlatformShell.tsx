"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, Menu, ShieldCheck, type LucideIcon } from "lucide-react";
import { SignOutButton } from "@/components/dashboard/SignOutButton";

// ------------------------------------------------------------
// Espace du SUPER_ADMIN (vous) — voir AUDIT.md 7.20. Volontairement séparé
// de DashboardShell/Sidebar : ce n'est PAS le dashboard d'une entreprise
// cliente, donc aucune notion d'organisation, de logo personnalisé ou de
// notifications par employé n'a sa place ici. Même langage visuel
// (couleurs, animations) que le reste de l'app pour rester cohérent.
// ------------------------------------------------------------

const PLATFORM_NAV: { label: string; href: string; icon: LucideIcon }[] = [
  { label: "Vue d'ensemble", href: "/platform", icon: LayoutDashboard },
  { label: "Organisations", href: "/platform/organizations", icon: Building2 },
];

export function PlatformShell({ userLabel, children }: { userLabel: string; children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[#F7F8FA] lg:grid lg:grid-cols-[240px_1fr]">
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-gradient-to-b from-[#1C2438] to-[#182032] shadow-xl transition-transform duration-300 ease-out lg:static lg:w-auto lg:translate-x-0 lg:shadow-none ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[#7FD9BD]">
            <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </span>
          <div>
            <p className="font-[family-name:var(--font-display)] text-base leading-tight text-white">
              Console
            </p>
            <p className="text-[11px] font-medium uppercase tracking-wider text-[#8891A5]">
              Propriétaire
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 py-4">
          {PLATFORM_NAV.map((item) => {
            const isActive = item.href === "/platform" ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-gradient-to-r from-[#2F6F5E] to-[#265A4C] text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)]"
                    : "text-[#B7BECC] hover:translate-x-0.5 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                    isActive ? "text-white" : "text-[#7C8598] group-hover:text-[#C9CFDA]"
                  }`}
                  strokeWidth={1.75}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {isSidebarOpen && (
        <button
          aria-label="Fermer le menu"
          onClick={() => setIsSidebarOpen(false)}
          className="animate-fade-in fixed inset-0 z-20 bg-black/30 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-[#E2E4E9] bg-white/90 px-4 py-3 backdrop-blur-sm sm:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="rounded-md p-2 text-[#1C2438] transition-colors hover:bg-[#F0F1F4] lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" strokeWidth={1.9} />
            </button>
            <span className="font-[family-name:var(--font-display)] text-lg text-[#1C2438]">
              Toutes les organisations
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-[#5B6478] sm:inline">{userLabel}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
