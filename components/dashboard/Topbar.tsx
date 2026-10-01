"use client";

import Link from "next/link";
import { Bell, Menu } from "lucide-react";
import { SignOutButton } from "./SignOutButton";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

type TopbarProps = {
  organizationName: string;
  userLabel: string;
  unreadNotifications: number;
  onToggleSidebar: () => void;
};

function initialsFrom(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Topbar({ organizationName, userLabel, unreadNotifications, onToggleSidebar }: TopbarProps) {
  const { t } = useI18n();
  return (
    <header className="flex items-center justify-between border-b border-[#E2E4E9] bg-white/90 px-4 py-3 backdrop-blur-sm sm:px-8">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-md p-2 text-[#1C2438] transition-colors hover:bg-[#F0F1F4] lg:hidden"
          aria-label={t("shell.openMenu")}
        >
          <Menu className="h-5 w-5" strokeWidth={1.9} />
        </button>
        <span className="font-[family-name:var(--font-display)] text-lg text-[#1C2438]">
          {organizationName}
        </span>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <LanguageSwitcher />
        <Link
          href="/dashboard/notifications"
          aria-label={
            unreadNotifications > 0
              ? t("shell.notificationsUnread", { count: unreadNotifications })
              : t("shell.notifications")
          }
          className="relative rounded-md p-2 text-[#1C2438] transition-colors hover:bg-[#F0F1F4]"
        >
          <Bell className="h-[19px] w-[19px]" strokeWidth={1.8} />
          {unreadNotifications > 0 && (
            <span className="animate-pulse-soft absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#8A3B3B] px-1 text-[10px] font-semibold text-white shadow-[0_0_0_2px_white]">
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </span>
          )}
        </Link>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#3D8C76] to-[#2F6F5E] text-[11px] font-semibold text-white">
            {initialsFrom(userLabel)}
          </span>
          <span className="text-sm text-[#5B6478]">{userLabel}</span>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
