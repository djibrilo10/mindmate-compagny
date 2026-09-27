"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Clock3,
  Eye,
  Inbox,
  Send,
  XCircle,
} from "lucide-react";

type Role = "SUPER_ADMIN" | "ORG_ADMIN" | "MANAGER" | "EMPLOYEE";
type JobPostingStatus = "OPEN" | "CLOSED";
type ApplicationStatus = "RECEIVED" | "IN_REVIEW" | "ACCEPTED" | "REJECTED";

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ORG_ADMIN: "Admin",
  MANAGER: "Gérant",
  EMPLOYEE: "Employé",
};

const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  RECEIVED: "Reçue",
  IN_REVIEW: "En révision",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
};

const APPLICATION_STATUS_STYLES: Record<ApplicationStatus, string> = {
  RECEIVED: "bg-[#EEF1F5] text-[#5B6478]",
  IN_REVIEW: "bg-[#FDF4E3] text-[#8A6D1D]",
  ACCEPTED: "bg-[#E7F3EF] text-[#2F6F5E]",
  REJECTED: "bg-[#FDECEC] text-[#8A3B3B]",
};

const APPLICATION_STATUS_ICONS: Record<ApplicationStatus, typeof Clock3> = {
  RECEIVED: Inbox,
  IN_REVIEW: Eye,
  ACCEPTED: CheckCircle2,
  REJECTED: XCircle,
};

const ALL_APPLICATION_STATUSES: ApplicationStatus[] = ["RECEIVED", "IN_REVIEW", "ACCEPTED", "REJECTED"];

type Application = {
  id: string;
  status: ApplicationStatus;
  message: string | null;
  createdAt: string;
  applicant: { id: string; firstName: string; lastName: string; role: Role };
};

type JobPosting = {
  id: string;
  title: string;
  description: string;
  status: JobPostingStatus;
  createdAt: string;
  applications: Application[];
  myApplication: { id: string; status: ApplicationStatus; message: string | null; createdAt: string } | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
}

export function JobPostingsList({
  initialPostings,
  canManage,
}: {
  initialPostings: JobPosting[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [postings, setPostings] = useState(initialPostings);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function toggleStatus(posting: JobPosting) {
    const nextStatus: JobPostingStatus = posting.status === "OPEN" ? "CLOSED" : "OPEN";
    setBusyId(posting.id);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${posting.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }
      setPostings((current) =>
        current.map((p) => (p.id === posting.id ? { ...p, status: nextStatus } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusyId(null);
    }
  }

  async function updateApplicationStatus(
    postingId: string,
    applicationId: string,
    nextStatus: ApplicationStatus
  ) {
    setBusyId(applicationId);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${postingId}/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la mise à jour");
      }
      setPostings((current) =>
        current.map((p) =>
          p.id !== postingId
            ? p
            : {
                ...p,
                applications: p.applications.map((a) =>
                  a.id === applicationId ? { ...a, status: nextStatus } : a
                ),
              }
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusyId(null);
    }
  }

  async function handleApply(event: FormEvent, posting: JobPosting) {
    event.preventDefault();
    setBusyId(posting.id);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${posting.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: applyMessage }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "Erreur lors de l'envoi de la candidature");
      }
      setPostings((current) =>
        current.map((p) =>
          p.id === posting.id
            ? {
                ...p,
                myApplication: {
                  id: data.application.id,
                  status: data.application.status,
                  message: data.application.message,
                  createdAt: data.application.createdAt,
                },
              }
            : p
        )
      );
      setApplyingId(null);
      setApplyMessage("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setBusyId(null);
    }
  }

  if (postings.length === 0) {
    return (
      <div className="animate-fade-in-up stagger-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
        <Briefcase className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
        <p className="text-sm text-[#5B6478]">Aucun poste ouvert pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="inline-flex items-center gap-1 text-sm text-[#8A3B3B]">
          <AlertCircle className="h-4 w-4" strokeWidth={2} />
          {error}
        </p>
      )}

      {postings.map((posting, index) => {
        const myStatusIcon = posting.myApplication
          ? APPLICATION_STATUS_ICONS[posting.myApplication.status]
          : null;
        const MyStatusIcon = myStatusIcon;

        return (
          <div
            key={posting.id}
            style={{ animationDelay: `${Math.min(index, 10) * 0.04}s` }}
            className="animate-fade-in-up rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-[family-name:var(--font-display)] text-lg text-[#1C2438]">
                    {posting.title}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                      posting.status === "OPEN"
                        ? "bg-[#E7F3EF] text-[#2F6F5E]"
                        : "bg-[#EEF1F5] text-[#5B6478]"
                    }`}
                  >
                    {posting.status === "OPEN" ? "Ouvert" : "Fermé"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#9AA1B2]">Publié le {formatDate(posting.createdAt)}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-[#5B6478]">{posting.description}</p>
              </div>

              {canManage && (
                <button
                  onClick={() => toggleStatus(posting)}
                  disabled={busyId === posting.id}
                  className="shrink-0 rounded-md border border-[#E2E4E9] px-3 py-1.5 text-xs font-medium text-[#1C2438] transition-colors hover:bg-[#F7F8FA] disabled:opacity-50"
                >
                  {posting.status === "OPEN" ? "Fermer le poste" : "Rouvrir le poste"}
                </button>
              )}
            </div>

            {canManage ? (
              <div className="mt-4 border-t border-[#F1F2F4] pt-3">
                <button
                  onClick={() => setExpandedId(expandedId === posting.id ? null : posting.id)}
                  className="text-xs font-medium text-[#2F6F5E] hover:underline"
                >
                  {expandedId === posting.id ? "Masquer" : "Voir"} les candidatures (
                  {posting.applications.length})
                </button>

                {expandedId === posting.id && (
                  <div className="animate-fade-in mt-3 space-y-2">
                    {posting.applications.length === 0 ? (
                      <p className="text-xs text-[#9AA1B2]">Aucune candidature reçue pour l'instant.</p>
                    ) : (
                      posting.applications.map((application) => (
                        <div
                          key={application.id}
                          className="rounded-lg bg-[#F7F8FA] p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="font-medium text-[#1C2438]">
                                {application.applicant.firstName} {application.applicant.lastName}
                              </span>
                              <span className="ml-1.5 text-xs text-[#9AA1B2]">
                                {ROLE_LABELS[application.applicant.role]} · {formatDate(application.createdAt)}
                              </span>
                            </div>
                            <select
                              value={application.status}
                              disabled={busyId === application.id}
                              onChange={(event) =>
                                updateApplicationStatus(
                                  posting.id,
                                  application.id,
                                  event.target.value as ApplicationStatus
                                )
                              }
                              className={`rounded-md border-0 px-2 py-1 text-xs font-medium focus:outline-none ${APPLICATION_STATUS_STYLES[application.status]}`}
                            >
                              {ALL_APPLICATION_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {APPLICATION_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </div>
                          {application.message && (
                            <p className="mt-2 whitespace-pre-wrap text-xs text-[#5B6478]">
                              {application.message}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-4 border-t border-[#F1F2F4] pt-3">
                {posting.myApplication && MyStatusIcon ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#5B6478]">Ta candidature :</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${APPLICATION_STATUS_STYLES[posting.myApplication.status]}`}
                    >
                      <MyStatusIcon className="h-3 w-3" strokeWidth={2} />
                      {APPLICATION_STATUS_LABELS[posting.myApplication.status]}
                    </span>
                    <span className="text-xs text-[#9AA1B2]">
                      envoyée le {formatDate(posting.myApplication.createdAt)}
                    </span>
                  </div>
                ) : posting.status !== "OPEN" ? (
                  <p className="text-xs text-[#9AA1B2]">Ce poste n'accepte plus de candidatures.</p>
                ) : applyingId === posting.id ? (
                  <form onSubmit={(event) => handleApply(event, posting)} className="space-y-2">
                    <textarea
                      value={applyMessage}
                      onChange={(event) => setApplyMessage(event.target.value)}
                      rows={3}
                      placeholder="Un mot de motivation (facultatif)"
                      className="w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={busyId === posting.id}
                        className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-3 py-1.5 text-xs font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0"
                      >
                        <Send className="h-3 w-3" strokeWidth={2} />
                        {busyId === posting.id ? "Envoi..." : "Envoyer ma candidature"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setApplyingId(null);
                          setApplyMessage("");
                        }}
                        className="text-xs text-[#5B6478] hover:underline"
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setApplyingId(posting.id)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-3 py-1.5 text-xs font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px"
                  >
                    <Send className="h-3 w-3" strokeWidth={2} />
                    Postuler
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
