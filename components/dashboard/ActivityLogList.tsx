"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import {
  CATEGORY_LABELS,
  actionCategory,
  actionLabel,
  actionDetail,
  type ActivityCategory,
} from "@/lib/activity-log";
import { CategoryIcon } from "@/components/dashboard/CategoryIcon";

type Role = "SUPER_ADMIN" | "ORG_ADMIN" | "MANAGER" | "EMPLOYEE";

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ORG_ADMIN: "Admin",
  MANAGER: "Gérant",
  EMPLOYEE: "Employé",
};

type ActivityEntry = {
  id: string;
  action: string;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string; role: Role } | null;
  targetName: string | null;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityLogList({ entries }: { entries: ActivityEntry[] }) {
  const [filter, setFilter] = useState<ActivityCategory | "ALL">("ALL");

  const categoriesPresent = useMemo(() => {
    const set = new Set<ActivityCategory>();
    entries.forEach((entry) => set.add(actionCategory(entry.action)));
    return Array.from(set);
  }, [entries]);

  const filtered = useMemo(
    () => (filter === "ALL" ? entries : entries.filter((entry) => actionCategory(entry.action) === filter)),
    [entries, filter]
  );

  if (entries.length === 0) {
    return (
      <div className="animate-fade-in-up stagger-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
        <History className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
        <p className="text-sm text-[#5B6478]">Aucune activité enregistrée pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up stagger-1">
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter("ALL")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filter === "ALL" ? "bg-[#2F6F5E] text-white" : "bg-[#EEF1F5] text-[#5B6478] hover:bg-[#E2E4E9]"
          }`}
        >
          Tout
        </button>
        {categoriesPresent.map((category) => (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === category ? "bg-[#2F6F5E] text-white" : "bg-[#EEF1F5] text-[#5B6478] hover:bg-[#E2E4E9]"
            }`}
          >
            <CategoryIcon category={category} className="h-3 w-3" />
            {CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>

      <ul className="space-y-1.5">
        {filtered.map((entry) => {
          const category = actionCategory(entry.action);
          const detail = actionDetail(entry.action, entry.metadata);
          return (
            <li
              key={entry.id}
              className="flex items-start gap-3 rounded-xl border border-[#E2E4E9] bg-white px-4 py-2.5 text-sm shadow-sm transition-shadow hover:shadow-md"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F7F8FA] text-[#5B6478]">
                <CategoryIcon category={category} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[#1C2438]">
                  <span className="font-medium">
                    {entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName}` : "Quelqu'un"}
                  </span>
                  {entry.actor && (
                    <span className="ml-1 text-xs text-[#9AA1B2]">({ROLE_LABELS[entry.actor.role]})</span>
                  )}
                  {" "}
                  {actionLabel(entry.action)}
                  {entry.targetName && (
                    <>
                      {" "}
                      <span className="text-[#5B6478]">— {entry.targetName}</span>
                    </>
                  )}
                  {detail && <span className="ml-1.5 text-xs text-[#9AA1B2]">({detail})</span>}
                </p>
              </div>
              <span className="shrink-0 text-xs text-[#9AA1B2]">{formatDateTime(entry.createdAt)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
