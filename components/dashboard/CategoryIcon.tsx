import {
  Briefcase,
  Building2,
  CalendarDays,
  FileText,
  Flag,
  Megaphone,
  MessageSquare,
  Star,
  User,
  type LucideIcon,
} from "lucide-react";
import type { ActivityCategory } from "@/lib/activity-log";

// Remplace les emojis de lib/activity-log.ts (CATEGORY_ICONS) par de vraies
// icônes vectorielles (passe esthétique, voir AUDIT.md 14). Réutilisé
// partout où une catégorie d'activité est affichée : tableau de bord
// (Activité récente), et à terme Historique/Notifications.
const CATEGORY_ICON_COMPONENTS: Record<ActivityCategory, LucideIcon> = {
  ANNOUNCEMENT: Megaphone,
  FILE: FileText,
  JOB: Briefcase,
  REPORT: Flag,
  ABSENCE: CalendarDays,
  MESSAGE: MessageSquare,
  REVIEW: Star,
  USER: User,
  ORGANIZATION: Building2,
};

export function CategoryIcon({
  category,
  className = "h-4 w-4",
}: {
  category: ActivityCategory;
  className?: string;
}) {
  const Icon = CATEGORY_ICON_COMPONENTS[category];
  return <Icon className={className} strokeWidth={1.9} aria-hidden />;
}
