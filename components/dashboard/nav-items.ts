import {
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  Download,
  FileText,
  Flag,
  History,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Settings,
  Star,
  TrendingDown,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { MessageKey } from "@/lib/i18n/translator";

// Libellés = clés de traduction (FR/EN, AUDIT.md 7.29), traduites dans Sidebar.tsx.
export const navItems: {
  labelKey: MessageKey;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  managementOnly?: boolean;
  nonAdminOnly?: boolean; // masqué pour les admins (ex. "Mon départ", voir AUDIT.md 7.26)
}[] = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "nav.notifications", href: "/dashboard/notifications", icon: Bell },
  { labelKey: "nav.employees", href: "/dashboard/employees", icon: Users },
  { labelKey: "nav.newHires", href: "/dashboard/new-hires", icon: UserPlus },
  { labelKey: "nav.departments", href: "/dashboard/departments", icon: Building2 },
  { labelKey: "nav.reports", href: "/dashboard/reports", icon: Flag },
  { labelKey: "nav.absences", href: "/dashboard/absences", icon: CalendarDays },
  { labelKey: "nav.files", href: "/dashboard/files", icon: FileText },
  { labelKey: "nav.announcements", href: "/dashboard/announcements", icon: Megaphone },
  { labelKey: "nav.jobs", href: "/dashboard/jobs", icon: Briefcase },
  { labelKey: "nav.reviews", href: "/dashboard/reviews", icon: Star },
  { labelKey: "nav.surveys", href: "/dashboard/surveys", icon: ClipboardList },
  { labelKey: "nav.messages", href: "/dashboard/messages", icon: MessageSquare },
  { labelKey: "nav.exports", href: "/dashboard/exports", icon: Download, managementOnly: true },
  { labelKey: "nav.retention", href: "/dashboard/retention", icon: TrendingDown, adminOnly: true },
  { labelKey: "nav.activity", href: "/dashboard/activity", icon: History, adminOnly: true },
  { labelKey: "nav.settings", href: "/dashboard/settings", icon: Settings, adminOnly: true },
  // En dernier, volontairement discret : annoncer son départ (AUDIT.md 7.26).
  { labelKey: "nav.departure", href: "/dashboard/departure", icon: DoorOpen, nonAdminOnly: true },
];
