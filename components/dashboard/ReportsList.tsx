"use client";

import { useState } from "react";
import { CircleDot, Clock3, Eye, Flag } from "lucide-react";

type ReportStatus = "NEW" | "SEEN" | "IN_PROGRESS" | "RESOLVED";

type Report = {
  id: string;
  title: string;
  description: string;
  status: ReportStatus;
  isAnonymous: boolean;
  createdAt: string;
  submitter: { firstName: string; lastName: string } | null;
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  NEW: "Nouveau",
  SEEN: "Vu",
  IN_PROGRESS: "En cours",
  RESOLVED: "Résolu",
};

const STATUS_STYLES: Record<ReportStatus, { className: string; icon: typeof CircleDot }> = {
  NEW: { className: "bg-[#FDECEC] text-[#8A3B3B]", icon: CircleDot },
  SEEN: { className: "bg-[#FFF4E0] text-[#8A6A1C]", icon: Eye },
  IN_PROGRESS: { className: "bg-[#E7F0FA] text-[#2A5A8A]", icon: Clock3 },
  RESOLVED: { className: "bg-[#E7F3EF] text-[#2F6F5E]", icon: Flag },
};

export function ReportsList({ initialReports }: { initialReports: Report[] }) {
  const [reports, setReports] = useState(initialReports);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function updateStatus(id: string, status: ReportStatus) {
    const previous = reports;
    setUpdatingId(id);
    setReports((current) => current.map((r) => (r.id === id ? { ...r, status } : r)));

    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error();
    } catch {
      // On annule le changement optimiste si la requête échoue côté serveur.
      setReports(previous);
    } finally {
      setUpdatingId(null);
    }
  }

  if (reports.length === 0) {
    return (
      <div className="animate-fade-in-up stagger-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
        <Flag className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
        <p className="text-sm text-[#5B6478]">Aucun signalement pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report, index) => {
        const status = STATUS_STYLES[report.status];
        const StatusIcon = status.icon;
        return (
          <div
            key={report.id}
            style={{ animationDelay: `${Math.min(index, 10) * 0.04}s` }}
            className="animate-fade-in-up rounded-xl border border-[#E2E4E9] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium text-[#1C2438]">{report.title}</h3>
                <p className="mt-1 text-sm text-[#5B6478]">{report.description}</p>
                <p className="mt-2 text-xs text-[#9AA1B2]">
                  {report.isAnonymous
                    ? "Anonyme"
                    : report.submitter
                      ? `${report.submitter.firstName} ${report.submitter.lastName}`
                      : "—"}
                  {" · "}
                  {new Date(report.createdAt).toLocaleDateString("fr-CA")}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                >
                  <StatusIcon className="h-3 w-3" strokeWidth={2} />
                  {STATUS_LABELS[report.status]}
                </span>
                <select
                  value={report.status}
                  disabled={updatingId === report.id}
                  onChange={(event) => updateStatus(report.id, event.target.value as ReportStatus)}
                  className="rounded-md border border-[#E2E4E9] px-2 py-1 text-xs transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none"
                >
                  {(Object.entries(STATUS_LABELS) as [ReportStatus, string][]).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
