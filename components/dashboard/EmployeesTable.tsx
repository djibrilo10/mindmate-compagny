"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, Copy, KeyRound, Loader2, Pencil, Phone, Search, UserX, X, XCircle } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { useI18n } from "@/components/i18n/I18nProvider";
import { DepartmentBadge } from "@/components/dashboard/DepartmentBadge";
import type { MessageKey } from "@/lib/i18n/translator";
import { Portal } from "@/components/ui/Portal";

// ------------------------------------------------------------
// Liste des employés (AUDIT.md 7.34) : recherche, filtre par département
// avec compteurs, badge du département ; pour les admins : changement de
// département (une personne ou une sélection) et désactivation.
// ------------------------------------------------------------

type UserStatus = "ACTIVE" | "DISABLED";
type Department = { id: string; name: string; color: string };
type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null; // facultatif depuis AUDIT.md 7.40
  phone: string | null;
  role: string;
  status: UserStatus;
  hireDate: string | null;
  department: Department | null;
};

const NONE = "__none__";

export function EmployeesTable({
  employees: initial,
  departments,
  canManage,
  currentUserId,
}: {
  employees: Employee[];
  departments: Department[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const { t, tx, formatDate } = useI18n();
  const [employees, setEmployees] = useState(initial);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Lien de réinitialisation du mot de passe généré par l'admin (AUDIT.md 7.35).
  const [resetLink, setResetLink] = useState<{ name: string; url: string; expiresAt: string } | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Numéro de téléphone (connexion par téléphone, AUDIT.md 7.40).
  const [phoneEdit, setPhoneEdit] = useState<{ id: string; name: string; value: string; error: string | null } | null>(null);
  const [phoneBusy, setPhoneBusy] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) map.set(e.department?.id ?? NONE, (map.get(e.department?.id ?? NONE) ?? 0) + 1);
    return map;
  }, [employees]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      if (filter && (e.department?.id ?? NONE) !== filter) return false;
      if (!q) return true;
      return `${e.firstName} ${e.lastName} ${e.email ?? ""} ${e.phone ?? ""} ${formatPhone(e.phone)}`.toLowerCase().includes(q);
    });
  }, [employees, query, filter]);

  async function move(ids: string[], departmentId: string) {
    if (ids.length === 0 || !departmentId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/users/department", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ids, departmentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      const dept = departments.find((d) => d.id === departmentId) ?? null;
      setEmployees((list) => list.map((e) => (ids.includes(e.id) ? { ...e, department: dept } : e)));
      setSelected(new Set());
      setMoveTo("");
      setMessage({ ok: true, text: t("departments.employees.moved", { count: data?.moved ?? ids.length }) });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : t("common.unknownError") });
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(id: string, nextStatus: UserStatus) {
    if (nextStatus === "DISABLED" && !window.confirm(t("departments.employees.confirmDisable"))) return;
    const previous = employees;
    setUpdatingId(id);
    setEmployees((list) => list.map((e) => (e.id === id ? { ...e, status: nextStatus } : e)));
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEmployees(previous);
    } finally {
      setUpdatingId(null);
    }
  }

  async function createResetLink(employee: Employee) {
    setLinkingId(employee.id);
    setMessage(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/users/${employee.id}/reset-link`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.url !== "string") throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      setResetLink({ name: `${employee.firstName} ${employee.lastName}`, url: data.url, expiresAt: data.expiresAt });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : t("common.unknownError") });
    } finally {
      setLinkingId(null);
    }
  }

  async function savePhone() {
    if (!phoneEdit) return;
    setPhoneBusy(true);
    try {
      const res = await fetch(`/api/users/${phoneEdit.id}/phone`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneEdit.value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      const saved: string | null = data?.phone ?? null;
      setEmployees((list) => list.map((e) => (e.id === phoneEdit.id ? { ...e, phone: saved } : e)));
      setMessage({ ok: true, text: saved ? t("departments.employees.phone.saved") : t("departments.employees.phone.removed") });
      setPhoneEdit(null);
    } catch (err) {
      setPhoneEdit((p) => (p ? { ...p, error: err instanceof Error ? err.message : t("common.unknownError") } : p));
    } finally {
      setPhoneBusy(false);
    }
  }

  async function copyResetLink() {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink.url);
      setCopied(true);
    } catch {
      // Presse-papiers bloqué (ancien navigateur) : le lien reste sélectionnable à la main.
    }
  }

  const allVisibleSelected = visible.length > 0 && visible.every((e) => selected.has(e.id));

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA1B2]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("departments.employees.search")}
          className="w-full max-w-md rounded-lg border border-[#E2E4E9] bg-white py-2 pl-9 pr-3 text-sm focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
        />
      </div>

      {/* Un bouton par département, avec son nombre de personnes. */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFilter("")}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === "" ? "border-[#1C2438] bg-[#1C2438] text-white" : "border-[#E2E4E9] bg-white text-[#5B6478]"}`}
        >
          {t("departments.employees.allDepartments")} · {employees.length}
        </button>
        {departments.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setFilter(filter === d.id ? "" : d.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
              filter === d.id ? "border-[#1C2438] bg-[#1C2438] text-white" : "border-[#E2E4E9] bg-white text-[#1C2438]"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
            {d.name} · {counts.get(d.id) ?? 0}
          </button>
        ))}
        {(counts.get(NONE) ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => setFilter(filter === NONE ? "" : NONE)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === NONE ? "border-[#1C2438] bg-[#1C2438] text-white" : "border-dashed border-[#C7CBD6] bg-white text-[#5B6478]"}`}
          >
            {t("departments.employees.noDepartment")} · {counts.get(NONE)}
          </button>
        )}
      </div>

      {canManage && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#2F6F5E]/30 bg-[#E7F3EF] px-3 py-2 text-sm">
          <span className="font-medium text-[#1C2438]">{t("departments.employees.selected", { count: selected.size })}</span>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="rounded-md border border-[#C7CBD6] bg-white px-2 py-1 text-sm">
            <option value="">{t("departments.employees.moveTo")}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!moveTo || busy}
            onClick={() => move(Array.from(selected), moveTo)}
            className="inline-flex items-center gap-1 rounded-md bg-[#2F6F5E] px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("departments.employees.move")}
          </button>
          <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-[#5B6478]">
            {t("common.cancel")}
          </button>
        </div>
      )}
      {message && (
        <p className={`flex items-center gap-1.5 text-sm ${message.ok ? "text-[#2F6F5E]" : "text-[#8A3B3B]"}`} role={message.ok ? undefined : "alert"}>
          {message.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {message.text}
        </p>
      )}

      {resetLink && (
        <div className="animate-scale-in rounded-xl border border-[#2F6F5E]/30 bg-[#F3F9F7] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#2F6F5E]" strokeWidth={2} />
              <div>
                <p className="text-sm font-medium text-[#1C2438]">{t("departments.employees.resetLinkTitle", { name: resetLink.name })}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#5B6478]">
                  {t("departments.employees.resetLinkHelp", {
                    date: formatDate(resetLink.expiresAt, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }),
                  })}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setResetLink(null)} aria-label={t("common.close")} className="rounded-md p-1 text-[#5B6478] hover:bg-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={resetLink.url}
              onFocus={(ev) => ev.target.select()}
              className="min-w-0 flex-1 rounded-md border border-[#C7CBD6] bg-white px-2.5 py-1.5 font-mono text-xs text-[#1C2438]"
            />
            <button
              type="button"
              onClick={copyResetLink}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#2F6F5E] px-3 py-1.5 text-xs font-medium text-white"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t("departments.employees.resetLinkCopied") : t("departments.employees.resetLinkCopy")}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#E2E4E9] bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#F7F8FA] text-xs uppercase tracking-wide text-[#5B6478]">
            <tr>
              {canManage && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={t("departments.employees.selectAll")}
                    checked={allVisibleSelected}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        for (const emp of visible) {
                          if (e.target.checked) next.add(emp.id);
                          else next.delete(emp.id);
                        }
                        return next;
                      })
                    }
                    className="accent-[#2F6F5E]"
                  />
                </th>
              )}
              <th className="px-4 py-3 font-medium">{t("departments.employees.name")}</th>
              <th className="px-4 py-3 font-medium">{t("departments.employees.department")}</th>
              <th className="px-4 py-3 font-medium">{t("departments.employees.contact")}</th>
              <th className="px-4 py-3 font-medium">{t("departments.employees.role")}</th>
              <th className="px-4 py-3 font-medium">{t("departments.employees.status")}</th>
              <th className="px-4 py-3 font-medium">{t("departments.employees.hireDate")}</th>
              {canManage && <th className="px-4 py-3 font-medium">{t("departments.employees.actions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E4E9]">
            {visible.length === 0 && (
              <tr>
                <td colSpan={canManage ? 8 : 6} className="px-4 py-8 text-center text-sm text-[#9AA1B2]">
                  {t("departments.employees.noMatch")}
                </td>
              </tr>
            )}
            {visible.map((e) => {
              const isSelf = e.id === currentUserId;
              const isAdminAccount = e.role === "ORG_ADMIN" || e.role === "SUPER_ADMIN";
              return (
                <tr key={e.id} className="transition-colors hover:bg-[#F7F8FA]">
                  {canManage && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`${e.firstName} ${e.lastName}`}
                        checked={selected.has(e.id)}
                        onChange={(ev) =>
                          setSelected((s) => {
                            const next = new Set(s);
                            if (ev.target.checked) next.add(e.id);
                            else next.delete(e.id);
                            return next;
                          })
                        }
                        className="accent-[#2F6F5E]"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-[#1C2438]">
                    {e.firstName} {e.lastName}
                  </td>
                  <td className="px-4 py-3">
                    {canManage ? (
                      // Admin : la liste déroulante sert à corriger le département d'une personne.
                      <select
                        value={e.department?.id ?? ""}
                        onChange={(ev) => ev.target.value && ev.target.value !== e.department?.id && move([e.id], ev.target.value)}
                        disabled={busy}
                        aria-label={t("departments.employees.department")}
                        className="max-w-[12rem] rounded-md border border-[#E2E4E9] bg-white px-2 py-1 text-xs text-[#1C2438]"
                        style={{ borderLeft: `4px solid ${e.department?.color ?? "#C7CBD6"}` }}
                      >
                        {!e.department && <option value="">{t("departments.employees.noDepartment")}</option>}
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    ) : e.department ? (
                      <DepartmentBadge name={e.department.name} color={e.department.color} />
                    ) : (
                      <span className="text-[#9AA1B2]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#5B6478]">
                    {e.email && <span className="block truncate">{e.email}</span>}
                    {e.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {formatPhone(e.phone)}
                      </span>
                    )}
                    {!e.email && !e.phone && "—"}
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => setPhoneEdit({ id: e.id, name: `${e.firstName} ${e.lastName}`, value: formatPhone(e.phone), error: null })}
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#2F6F5E] hover:underline"
                      >
                        <Pencil className="h-3 w-3" /> {e.phone ? t("departments.employees.phone.edit") : t("departments.employees.phone.add")}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#5B6478]">{t(`departments.roles.${e.role}` as MessageKey)}</td>
                  <td className="px-4 py-3">
                    {e.status === "ACTIVE" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F3EF] px-2 py-0.5 text-xs font-medium text-[#2F6F5E]">
                        <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> {t("departments.employees.active")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F4E7E7] px-2 py-0.5 text-xs font-medium text-[#8A3B3B]">
                        <XCircle className="h-3 w-3" strokeWidth={2} /> {t("departments.employees.disabled")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#5B6478]">
                    {e.hireDate ? formatDate(e.hireDate, { year: "numeric", month: "short", day: "numeric" }) : "—"}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className="text-xs text-[#9AA1B2]">—</span>
                      ) : isAdminAccount ? (
                        <span className="text-xs text-[#9AA1B2]">{t("departments.employees.managedInSettings")}</span>
                      ) : e.status === "ACTIVE" ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() => createResetLink(e)}
                            disabled={linkingId === e.id}
                            title={t("departments.employees.resetLinkTooltip")}
                            className="inline-flex items-center gap-1 rounded-md border border-[#C7CBD6] px-2 py-1 text-xs font-medium text-[#1C2438] hover:bg-[#F7F8FA] disabled:opacity-50"
                          >
                            {linkingId === e.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" strokeWidth={2} />}
                            {t("departments.employees.resetLink")}
                          </button>
                          <button
                            onClick={() => toggleStatus(e.id, "DISABLED")}
                            disabled={updatingId === e.id}
                            className="inline-flex items-center gap-1 rounded-md border border-[#8A3B3B] px-2 py-1 text-xs font-medium text-[#8A3B3B] hover:bg-[#FDECEC] disabled:opacity-50"
                          >
                            <UserX className="h-3 w-3" strokeWidth={2} /> {t("departments.employees.disable")}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleStatus(e.id, "ACTIVE")}
                          disabled={updatingId === e.id}
                          className="inline-flex items-center gap-1 rounded-md border border-[#2F6F5E] px-2 py-1 text-xs font-medium text-[#2F6F5E] hover:bg-[#E7F3EF] disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3 w-3" strokeWidth={2} /> {t("departments.employees.reactivate")}
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

      {phoneEdit && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1C2438]/40 p-4 sm:items-center" onClick={() => !phoneBusy && setPhoneEdit(null)}>
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                savePhone();
              }}
              onClick={(ev) => ev.stopPropagation()}
              className="w-full max-w-sm animate-scale-in rounded-2xl bg-white p-5 shadow-xl"
            >
              <h2 className="text-base font-semibold text-[#1C2438]">{t("departments.employees.phone.title")}</h2>
              <p className="mt-0.5 text-sm text-[#5B6478]">{phoneEdit.name}</p>
              <input
                type="tel"
                inputMode="tel"
                autoFocus
                value={phoneEdit.value}
                onChange={(ev) => setPhoneEdit({ ...phoneEdit, value: ev.target.value, error: null })}
                placeholder="514-555-1234"
                className="mt-4 w-full rounded-lg border border-[#DADEE5] px-3 py-2.5 text-base"
              />
              <p className="mt-2 text-xs leading-relaxed text-[#5B6478]">{t("departments.employees.phone.help")}</p>
              {phoneEdit.error && (
                <p className="mt-2 text-sm text-[#8A3B3B]" role="alert">
                  {phoneEdit.error}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setPhoneEdit(null)} className="rounded-lg px-3 py-2 text-sm text-[#5B6478] hover:bg-[#F7F8FA]">
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={phoneBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#2F6F5E] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {phoneBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </Portal>
      )}
    </div>
  );
}
