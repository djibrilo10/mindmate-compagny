"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, XCircle } from "lucide-react";

type AbsenceStatus = "PENDING" | "APPROVED" | "REJECTED";

type Absence = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: AbsenceStatus;
  createdAt: string;
  user: { firstName: string; lastName: string } | null;
};

const STATUS_LABELS: Record<AbsenceStatus, string> = {
  PENDING: "En attente",
  APPROVED: "Approuvée",
  REJECTED: "Rejetée",
};

const STATUS_STYLES: Record<AbsenceStatus, { className: string; icon: typeof Clock3 }> = {
  PENDING: { className: "bg-[#FFF4E0] text-[#8A6A1C]", icon: Clock3 },
  APPROVED: { className: "bg-[#E7F3EF] text-[#2F6F5E]", icon: CheckCircle2 },
  REJECTED: { className: "bg-[#FDECEC] text-[#8A3B3B]", icon: XCircle },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("fr-CA");
}

export function AbsencesList({
  initialAbsences,
  canManage,
}: {
  initialAbsences: Absence[];
  canManage: boolean;
}) {
  const [absences, setAbsences] = useState(initialAbsences);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function updateStatus(id: string, status: "APPROVED" | "REJECTED") {
    const previous = absences;
    setUpdatingId(id);
    setAbsences((current) => current.map((a) => (a.id === id ? { ...a, status } : a)));

    try {
      const response = await fetch(`/api/absences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error();
    } catch {
      // On annule le changement optimiste si la requête échoue côté serveur.
      setAbsences(previous);
    } finally {
      setUpdatingId(null);
    }
  }

  if (absences.length === 0) {
    return (
      <div className="animate-fade-in-up stagger-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
        <CalendarDays className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
        <p className="text-sm text-[#5B6478]">
          {canManage
            ? "Aucune demande d'absence pour le moment."
            : "Tu n'as encore déclaré aucune absence."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {absences.map((absence, index) => {
        const status = STATUS_STYLES[absence.status];
        const StatusIcon = status.icon;
        return (
          <div
            key={absence.id}
            style={{ animationDelay: `${Math.min(index, 10) * 0.04}s` }}
            className="animate-fade-in-up rounded-xl border border-[#E2E4E9] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                {canManage && absence.user && (
                  <p className="text-sm font-medium text-[#1C2438]">
                    {absence.user.firstName} {absence.user.lastName}
                  </p>
                )}
                <p className="mt-1 text-sm text-[#5B6478]">
                  Du {formatDate(absence.startDate)} au {formatDate(absence.endDate)}
                </p>
                <p className="mt-1 text-sm text-[#5B6478]">{absence.reason}</p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                >
                  <StatusIcon className="h-3 w-3" strokeWidth={2} />
                  {STATUS_LABELS[absence.status]}
                </span>
                {canManage && absence.status === "PENDING" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateStatus(absence.id, "APPROVED")}
                      disabled={updatingId === absence.id}
                      className="inline-flex items-center gap-1 rounded-md border border-[#2F6F5E] px-2 py-1 text-xs font-medium text-[#2F6F5E] transition-colors hover:bg-[#E7F3EF] disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                      Approuver
                    </button>
                    <button
                      onClick={() => updateStatus(absence.id, "REJECTED")}
                      disabled={updatingId === absence.id}
                      className="inline-flex items-center gap-1 rounded-md border border-[#8A3B3B] px-2 py-1 text-xs font-medium text-[#8A3B3B] transition-colors hover:bg-[#FDECEC] disabled:opacity-50"
                    >
                      <XCircle className="h-3 w-3" strokeWidth={2} />
                      Rejeter
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
