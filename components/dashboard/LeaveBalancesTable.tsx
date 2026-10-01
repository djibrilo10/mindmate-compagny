"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

// Congés > Soldes (admins, AUDIT.md 7.30) : solde disponible par employé et
// par type décompté ; « Ajuster » ajoute/retire des jours pour une personne.

export type BalanceType = { id: string; label: string; color: string };
export type BalanceEmployee = {
  id: string;
  name: string;
  department: string | null;
  balances: Record<string, { available: number | null; pending: number; used: number }>;
  adjustments: { id: string; typeLabel: string; days: number; note: string | null; createdAt: string }[];
};

export function LeaveBalancesTable({
  year,
  types,
  employees,
}: {
  year: number;
  types: BalanceType[];
  employees: BalanceEmployee[];
}) {
  const router = useRouter();
  const { t, tx, formatNumber, formatDate } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent, userId: string) {
    event.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/leave/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, leaveTypeId: typeId, year, days, note }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      setDays("");
      setNote("");
      setStatus("saved");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    }
  }

  if (types.length === 0) {
    return <p className="rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-10 text-center text-sm text-[#5B6478]">{t("leave.balancesAdmin.noTracked")}</p>;
  }
  if (employees.length === 0) {
    return <p className="rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-10 text-center text-sm text-[#5B6478]">{t("leave.balancesAdmin.empty")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E4E9] bg-white shadow-sm">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-[#E2E4E9] text-left text-xs text-[#5B6478]">
            <th className="px-4 py-2.5 font-medium">{t("leave.balancesAdmin.employee")}</th>
            {types.map((type) => (
              <th key={type.id} className="px-3 py-2.5 text-right font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: type.color }} aria-hidden />
                  {type.label}
                </span>
              </th>
            ))}
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E4E9]">
          {employees.map((emp) => (
            <tr key={emp.id} className="align-top">
              <td className="px-4 py-2.5">
                <p className="font-medium text-[#1C2438]">{emp.name}</p>
                {emp.department && <p className="text-xs text-[#9AA1B2]">{emp.department}</p>}
                {openId === emp.id && (
                  <form onSubmit={(e) => submit(e, emp.id)} className="mt-3 max-w-md space-y-2 rounded-lg border border-[#E2E4E9] bg-[#F7F8FA] p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[#1C2438]">{t("leave.balancesAdmin.adjustTitle", { name: emp.name })}</p>
                      <button type="button" onClick={() => setOpenId(null)} aria-label={t("common.close")} className="text-[#5B6478]">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="w-full rounded-lg border border-[#E2E4E9] bg-white px-2 py-1.5 text-sm">
                      {types.map((type) => (
                        <option key={type.id} value={type.id}>{type.label}</option>
                      ))}
                    </select>
                    <label className="block text-xs text-[#5B6478]">
                      {t("leave.balancesAdmin.daysLabel")}
                      <input
                        inputMode="decimal"
                        value={days}
                        onChange={(e) => setDays(e.target.value)}
                        placeholder="2"
                        className="mt-1 w-full rounded-lg border border-[#E2E4E9] bg-white px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block text-xs text-[#5B6478]">
                      {t("leave.balancesAdmin.noteLabel")}
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={200}
                        placeholder={t("leave.balancesAdmin.notePlaceholder")}
                        className="mt-1 w-full rounded-lg border border-[#E2E4E9] bg-white px-2 py-1.5 text-sm"
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="submit"
                        disabled={!days.trim() || status === "saving"}
                        className="inline-flex items-center gap-1 rounded-md bg-[#2F6F5E] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                        {t("leave.balancesAdmin.save")}
                      </button>
                      {status === "saved" && (
                        <span className="inline-flex items-center gap-1 text-xs text-[#2F6F5E]">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {t("leave.balancesAdmin.saved")}
                        </span>
                      )}
                      {status === "error" && (
                        <span className="inline-flex items-center gap-1 text-xs text-[#8A3B3B]">
                          <AlertCircle className="h-3.5 w-3.5" /> {error}
                        </span>
                      )}
                    </div>
                    {emp.adjustments.length > 0 && (
                      <ul className="space-y-0.5 border-t border-[#E2E4E9] pt-2 text-xs text-[#5B6478]">
                        {emp.adjustments.map((a) => (
                          <li key={a.id}>
                            {formatDate(a.createdAt, { day: "numeric", month: "short" })} · {a.typeLabel}{" "}
                            <strong className={a.days < 0 ? "text-[#8A3B3B]" : "text-[#2F6F5E]"}>
                              {a.days > 0 ? "+" : ""}
                              {formatNumber(a.days)}
                            </strong>
                            {a.note ? ` — ${a.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </form>
                )}
              </td>
              {types.map((type) => {
                const b = emp.balances[type.id];
                const value = b?.available;
                return (
                  <td key={type.id} className="px-3 py-2.5 text-right tabular-nums">
                    {value == null ? (
                      <span className="text-[#5B6478]">{t("leave.balancesAdmin.taken", { days: formatNumber(b?.used ?? 0) })}</span>
                    ) : (
                      <span className={value < 0 ? "font-medium text-[#8A3B3B]" : "text-[#1C2438]"}>{formatNumber(value)}</span>
                    )}
                    {b && b.pending > 0 && (
                      <span className="block text-[11px] text-[#8A6A1C]">
                        {t("leave.balance.pending", { days: formatNumber(b.pending) })}
                      </span>
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(openId === emp.id ? null : emp.id);
                    setStatus("idle");
                    setError("");
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-[#DADEE5] px-2.5 py-1.5 text-xs font-medium text-[#1C2438] hover:border-[#2F6F5E] hover:text-[#2F6F5E]"
                >
                  <SlidersHorizontal className="h-3 w-3" /> {t("leave.balancesAdmin.adjust")}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
