"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "./nav-items";

type Role = "SUPER_ADMIN" | "ORG_ADMIN" | "MANAGER" | "EMPLOYEE";
const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];
const MANAGEMENT_ROLES: Role[] = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];

export function Sidebar({ onNavigate, role }: { onNavigate?: () => void; role: Role }) {
  const pathname = usePathname();
  const isAdmin = ADMIN_ROLES.includes(role);
  const isManagement = MANAGEMENT_ROLES.includes(role);
  const visibleItems = navItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.managementOnly && !isManagement) return false;
    return true;
  });

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-6">
      {visibleItems.map((item) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === item.href
            : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
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
  );
}
