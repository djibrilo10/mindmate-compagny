"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, Inbox, LayoutDashboard, LifeBuoy, Menu, ShieldCheck, type LucideIcon } from "lucide-react";
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
  { label: "Support", href: "/platform/support", icon: LifeBuoy }, // messages des admins principaux (AUDIT.md 7.24)
  { label: "Demandes de démo", href: "/platform/demo-requests", icon: Inbox }, // page d'accueil publique (AUDIT.md 7.43)
  { label: "Notifications", href: "/platform/notifications", icon: Bell }, // (AUDIT.md 7.25)
];

export function PlatformShell({
  userLabel,
  supportUnread = 0,
  unreadNotifications = 0,
  children,
}: {
  userLabel: string;
  supportUnread?: number;
  unreadNotifications?: number;
  children: ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();

  // Badge numérique sur l'icône de l'app installée (PWA), resynchronisé à
  // chaque page de la console avec le vrai nombre de non-lus (AUDIT.md 7.25).
  // Quand l'app est fermée, c'est public/sw.js qui le met à jour à chaque push.
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge) return;
    if (unreadNotifications > 0) nav.setAppBadge(unreadNotifications).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [unreadNotifications]);

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
                {item.href === "/platform/notifications" && unreadNotifications > 0 && (
                  <span className="ml-auto rounded-full bg-[#8A3B3B] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
                {item.href === "/platform/support" && supportUnread > 0 && (
                  <span className="ml-auto rounded-full bg-[#C2542C] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {supportUnread}
                  </span>
                )}
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
            {/* Cloche + badge, comme dans le Topbar des organisations (7.25). */}
            <Link
              href="/platform/notifications"
              aria-label={unreadNotifications > 0 ? `Notifications (${unreadNotifications} non lues)` : "Notifications"}
              className="relative rounded-md p-2 text-[#1C2438] transition-colors hover:bg-[#F0F1F4]"
            >
              <Bell className="h-[19px] w-[19px]" strokeWidth={1.8} />
              {unreadNotifications > 0 && (
                <span className="animate-pulse-soft absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#8A3B3B] px-1 text-[10px] font-semibold text-white shadow-[0_0_0_2px_white]">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </Link>
            <span className="hidden text-sm text-[#5B6478] sm:inline">{userLabel}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
