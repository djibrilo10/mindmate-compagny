import {
  Bell,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  Download,
  FileText,
  Flag,
  History,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Settings,
  Star,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export const navItems: {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  managementOnly?: boolean;
}[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
  { label: "Notifications", href: "/dashboard/notifications", icon: Bell },
  { label: "Employés", href: "/dashboard/employees", icon: Users },
  { label: "Nouvelles recrues", href: "/dashboard/new-hires", icon: UserPlus },
  { label: "Départements", href: "/dashboard/departments", icon: Building2 },
  { label: "Signalements", href: "/dashboard/reports", icon: Flag },
  { label: "Absences", href: "/dashboard/absences", icon: CalendarDays },
  { label: "Documents", href: "/dashboard/files", icon: FileText },
  { label: "Annonces", href: "/dashboard/announcements", icon: Megaphone },
  { label: "Postes ouverts", href: "/dashboard/jobs", icon: Briefcase },
  { label: "Avis", href: "/dashboard/reviews", icon: Star },
  { label: "Sondages", href: "/dashboard/surveys", icon: ClipboardList },
  { label: "Messages", href: "/dashboard/messages", icon: MessageSquare },
  { label: "Exports", href: "/dashboard/exports", icon: Download, managementOnly: true },
  { label: "Historique", href: "/dashboard/activity", icon: History, adminOnly: true },
  { label: "Paramètres", href: "/dashboard/settings", icon: Settings, adminOnly: true },
];
