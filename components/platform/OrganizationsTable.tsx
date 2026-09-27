"use client";

import { useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  employeeCount: number;
};

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuit",
  pro: "Pro",
  enterprise: "Entreprise",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

export function OrganizationsTable({ initialOrganizations }: { initialOrganizations: OrganizationRow[] }) {
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleStatus(org: OrganizationRow) {
    if (confirmingId !== org.id) {
      setConfirmingId(org.id);
      return;
    }

    const nextStatus = org.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setPendingId(org.id);
    setError(null);
    try {
      const res = await fetch(`/api/platform/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Impossible de mettre à jour cette organisation.");
        return;
      }
      setOrganizations((prev) => prev.map((o) => (o.id === org.id ? { ...o, status: nextStatus } : o)));
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setPendingId(null);
      setConfirmingId(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E4E9] bg-white">
      {error && (
        <p className="border-b border-[#F0F1F4] px-5 py-3 text-sm text-[#C2542C]" role="alert">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#E2E4E9] text-xs uppercase tracking-wide text-[#8891A5]">
              <th className="px-5 py-3 font-medium">Organisation</th>
              <th className="px-5 py-3 font-medium">Plan</th>
              <th className="px-5 py-3 font-medium">Employés</th>
              <th className="px-5 py-3 font-medium">Créée le</th>
              <th className="px-5 py-3 font-medium">Statut</th>
              <th className="px-5 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((org) => {
              const isConfirming = confirmingId === org.id;
              const isPending = pendingId === org.id;
              const isSuspended = org.status === "SUSPENDED";

              return (
                <tr key={org.id} className="border-b border-[#F0F1F4] last:border-b-0">
                  <td className="px-5 py-3">
                    <p className="font-medium text-[#1C2438]">{org.name}</p>
                    <p className="text-xs text-[#8891A5]">{org.slug}</p>
                  </td>
                  <td className="px-5 py-3 text-[#5B6478]">{PLAN_LABELS[org.plan] ?? org.plan}</td>
                  <td className="px-5 py-3 text-[#5B6478]">{org.employeeCount}</td>
                  <td className="px-5 py-3 text-[#5B6478]">{formatDate(org.createdAt)}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        isSuspended ? "bg-[#FDECEC] text-[#8A3B3B]" : "bg-[#E7F3EF] text-[#2F6F5E]"
                      }`}
                    >
                      {isSuspended ? "Suspendue" : "Active"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleStatus(org)}
                        disabled={isPending}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          isConfirming
                            ? isSuspended
                              ? "bg-[#2F6F5E] text-white hover:bg-[#265A4C]"
                              : "bg-[#C2542C] text-white hover:bg-[#A8451F]"
                            : "border border-[#DADEE5] text-[#1C2438] hover:border-[#2F6F5E] hover:text-[#2F6F5E]"
                        }`}
                      >
                        {isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isSuspended ? (
                          <ShieldCheck className="h-3.5 w-3.5" strokeWidth={1.9} />
                        ) : (
                          <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.9} />
                        )}
                        {isPending
                          ? "…"
                          : isConfirming
                            ? "Confirmer"
                            : isSuspended
                              ? "Réactiver"
                              : "Suspendre"}
                      </button>
                      {isConfirming && !isPending && (
                        <button
                          type="button"
                          onClick={() => setConfirmingId(null)}
                          className="text-xs text-[#5B6478] hover:text-[#1C2438]"
                        >
                          Annuler
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
