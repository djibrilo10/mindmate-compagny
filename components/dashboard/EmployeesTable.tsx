"use client";

import { useState } from "react";
import { CheckCircle2, UserX, XCircle } from "lucide-react";

type UserStatus = "ACTIVE" | "DISABLED";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  status: UserStatus;
  hireDate: string | null;
  department: { name: string } | null;
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  ORG_ADMIN: "Admin",
  MANAGER: "Gérant",
  EMPLOYEE: "Employé",
};

const STATUS_STYLES: Record<
  UserStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  ACTIVE: { label: "Actif", className: "bg-[#E7F3EF] text-[#2F6F5E]", icon: CheckCircle2 },
  DISABLED: { label: "Désactivé", className: "bg-[#F4E7E7] text-[#8A3B3B]", icon: XCircle },
};

function initialsFrom(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function EmployeesTable({
  initialEmployees,
  canManage,
  currentUserId,
}: {
  initialEmployees: Employee[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function toggleStatus(id: string, nextStatus: UserStatus) {
    if (nextStatus === "DISABLED") {
      const confirmed = window.confirm(
        "Désactiver ce compte ? La personne ne pourra plus se connecter, mais son historique est conservé."
      );
      if (!confirmed) return;
    }

    const previous = employees;
    setUpdatingId(id);
    setEmployees((current) =>
      current.map((e) => (e.id === id ? { ...e, status: nextStatus } : e))
    );

    try {
      const response = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) throw new Error();
    } catch {
      // On annule le changement optimiste si la requête échoue côté serveur.
      setEmployees(previous);
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E4E9] bg-white shadow-sm">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-[#F7F8FA] text-xs uppercase tracking-wide text-[#5B6478]">
          <tr>
            <th className="px-4 py-3 font-medium">Nom</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Département</th>
            <th className="px-4 py-3 font-medium">Rôle</th>
            <th className="px-4 py-3 font-medium">Statut</th>
            <th className="px-4 py-3 font-medium">Embauché le</th>
            {canManage && <th className="px-4 py-3 font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E4E9]">
          {employees.map((employee) => {
            const status = STATUS_STYLES[employee.status] ?? STATUS_STYLES.ACTIVE;
            const StatusIcon = status.icon;
            const isSelf = employee.id === currentUserId;

            return (
              <tr key={employee.id} className="transition-colors hover:bg-[#F7F8FA]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3D8C76] to-[#2F6F5E] text-[11px] font-semibold text-white">
                      {initialsFrom(employee.firstName, employee.lastName)}
                    </span>
                    <span className="font-medium text-[#1C2438]">
                      {employee.firstName} {employee.lastName}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[#5B6478]">{employee.email}</td>
                <td className="px-4 py-3 text-[#5B6478]">
                  {employee.department?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-[#5B6478]">
                  {ROLE_LABELS[employee.role] ?? employee.role}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                  >
                    <StatusIcon className="h-3 w-3" strokeWidth={2} />
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-[#5B6478]">
                  {employee.hireDate
                    ? new Date(employee.hireDate).toLocaleDateString("fr-CA")
                    : "—"}
                </td>
                {canManage && (
                  <td className="px-4 py-3">
                    {isSelf ? (
                      <span className="text-xs text-[#9AA1B2]">—</span>
                    ) : employee.status === "ACTIVE" ? (
                      <button
                        onClick={() => toggleStatus(employee.id, "DISABLED")}
                        disabled={updatingId === employee.id}
                        className="inline-flex items-center gap-1 rounded-md border border-[#8A3B3B] px-2 py-1 text-xs font-medium text-[#8A3B3B] transition-colors hover:bg-[#FDECEC] disabled:opacity-50"
                      >
                        <UserX className="h-3 w-3" strokeWidth={2} />
                        Désactiver
                      </button>
                    ) : (
                      <button
                        onClick={() => toggleStatus(employee.id, "ACTIVE")}
                        disabled={updatingId === employee.id}
                        className="inline-flex items-center gap-1 rounded-md border border-[#2F6F5E] px-2 py-1 text-xs font-medium text-[#2F6F5E] transition-colors hover:bg-[#E7F3EF] disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                        Réactiver
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
