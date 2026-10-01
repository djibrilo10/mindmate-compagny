"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  UserX,
  X,
  XCircle,
} from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

// ------------------------------------------------------------
// Paramètres > Équipe d'administration (voir AUDIT.md 7.22).
// Tous les admins voient l'équipe ; seul l'admin PRINCIPAL a les boutons
// (ajouter, désactiver/réactiver, remplacer, retirer). Les données viennent
// du serveur (app/dashboard/settings/page.tsx) : après chaque action on fait
// router.refresh() plutôt que de maintenir une copie locale qui pourrait
// diverger de la base.
// ------------------------------------------------------------

type Admin = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
  isPrimary: boolean;
};

type Candidate = { id: string; firstName: string; lastName: string; email: string };

function initials(a: { firstName: string; lastName: string }) {
  return `${a.firstName.charAt(0)}${a.lastName.charAt(0)}`.toUpperCase();
}

const inputClass =
  "mt-1 w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12";

export function AdminsCard({
  admins,
  candidates,
  isPrimary,
  maxCoAdmins,
}: {
  admins: Admin[];
  candidates: Candidate[];
  isPrimary: boolean;
  maxCoAdmins: number;
}) {
  const router = useRouter();
  const { t, tx } = useI18n();
  const coAdmins = admins.filter((a) => !a.isPrimary);
  const slotsLeft = maxCoAdmins - coAdmins.length;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // Panneau d'ajout : ouvert pour un ajout simple ou pour remplacer un co-admin.
  const [panelOpen, setPanelOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<Admin | null>(null);
  const [mode, setMode] = useState<"promote" | "create">("promote");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? candidates.filter((c) =>
          `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(q)
        )
      : candidates;
    return list.slice(0, 8);
  }, [candidates, query]);

  function openPanel(target: Admin | null) {
    setReplaceTarget(target);
    setPanelOpen(true);
    setMode("promote");
    setQuery("");
    setSelectedId(null);
    setForm({ firstName: "", lastName: "", email: "", password: "" });
    setError(null);
    setSuccess(null);
  }

  async function call(url: string, init: RequestInit, okMessage: string) {
    setError(null);
    setSuccess(null);
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
    setSuccess(okMessage);
    router.refresh();
  }

  async function toggleStatus(admin: Admin) {
    setBusyId(admin.id);
    try {
      const next = admin.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
      await call(
        `/api/admins/${admin.id}`,
        { method: "PATCH", body: JSON.stringify({ status: next }) },
        next === "DISABLED"
          ? t("settings.admins.okDisabled", { name: admin.firstName })
          : t("settings.admins.okReactivated", { name: admin.firstName })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(admin: Admin, disableAccount: boolean) {
    setBusyId(admin.id);
    try {
      await call(
        `/api/admins/${admin.id}`,
        { method: "DELETE", body: JSON.stringify({ disableAccount }) },
        disableAccount
          ? t("settings.admins.okRemovedDisabled", { name: admin.firstName })
          : t("settings.admins.okRemoved", { name: admin.firstName })
      );
      setConfirmRemoveId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const payload =
        mode === "promote"
          ? { mode, userId: selectedId, replaceUserId: replaceTarget?.id }
          : { mode, ...form, replaceUserId: replaceTarget?.id };
      await call(
        "/api/admins",
        { method: "POST", body: JSON.stringify(payload) },
        replaceTarget ? t("settings.admins.okReplaced") : t("settings.admins.okAdded")
      );
      setPanelOpen(false);
      setReplaceTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    mode === "promote"
      ? Boolean(selectedId)
      : Boolean(form.firstName.trim() && form.lastName.trim() && form.email.trim() && form.password);

  return (
    <div className="max-w-3xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-[#1C2438]">
            <ShieldCheck className="h-4 w-4 text-[#2F6F5E]" strokeWidth={1.9} />
            {t("settings.admins.title")}
          </h2>
          <p className="mt-1 text-sm text-[#5B6478]">
            {t("settings.admins.description", { max: maxCoAdmins })}{" "}
            {isPrimary ? t("settings.admins.primaryCanEdit") : t("settings.admins.onlyPrimaryCanEdit")}
          </p>
        </div>
        <span className="rounded-full bg-[#F3F5F8] px-3 py-1 text-xs font-medium text-[#1C2438]">
          {t("settings.admins.count", { count: coAdmins.length, max: maxCoAdmins })}
        </span>
      </div>

      <ul className="mt-5 divide-y divide-[#E4E7EE] rounded-lg border border-[#E4E7EE]">
        {admins.map((admin) => {
          const busy = busyId === admin.id;
          return (
            <li key={admin.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${
                  admin.status === "ACTIVE"
                    ? "bg-gradient-to-br from-[#3D8C76] to-[#2F6F5E]"
                    : "bg-[#B7BECC]"
                }`}
              >
                {initials(admin)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#1C2438]">
                  {admin.firstName} {admin.lastName}
                  {admin.isPrimary ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FDF3E3] px-2 py-0.5 text-[11px] font-medium text-[#8A6A1C]">
                      <Crown className="h-3 w-3" strokeWidth={2} /> {t("settings.admins.primary")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-[#E7F0FA] px-2 py-0.5 text-[11px] font-medium text-[#2A5A8A]">
                      {t("settings.admins.coAdmin")}
                    </span>
                  )}
                  {admin.status === "DISABLED" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#F4E7E7] px-2 py-0.5 text-[11px] font-medium text-[#8A3B3B]">
                      <XCircle className="h-3 w-3" strokeWidth={2} /> {t("settings.admins.disabled")}
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-[#5B6478]">{admin.email}</p>
              </div>

              {isPrimary && !admin.isPrimary && (
                <div className="flex flex-wrap items-center gap-2">
                  {confirmRemoveId === admin.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => remove(admin, false)}
                        disabled={busy}
                        className="rounded-md bg-[#C2542C] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#A8451F] disabled:opacity-60"
                      >
                        {t("settings.admins.removeKeepEmployee")}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(admin, true)}
                        disabled={busy}
                        className="rounded-md border border-[#8A3B3B] px-2.5 py-1.5 text-xs font-medium text-[#8A3B3B] hover:bg-[#FDECEC] disabled:opacity-60"
                      >
                        {t("settings.admins.removeAndDisable")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(null)}
                        className="text-xs text-[#5B6478] hover:text-[#1C2438]"
                      >
                        {t("common.cancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => toggleStatus(admin)}
                        disabled={busy}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                          admin.status === "ACTIVE"
                            ? "border-[#8A3B3B] text-[#8A3B3B] hover:bg-[#FDECEC]"
                            : "border-[#2F6F5E] text-[#2F6F5E] hover:bg-[#E7F3EF]"
                        }`}
                      >
                        {busy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : admin.status === "ACTIVE" ? (
                          <UserX className="h-3 w-3" strokeWidth={2} />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                        )}
                        {admin.status === "ACTIVE" ? t("settings.admins.disable") : t("settings.admins.reactivate")}
                      </button>
                      <button
                        type="button"
                        onClick={() => openPanel(admin)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-md border border-[#DADEE5] px-2.5 py-1.5 text-xs font-medium text-[#1C2438] hover:border-[#2F6F5E] hover:text-[#2F6F5E] disabled:opacity-60"
                      >
                        <RefreshCw className="h-3 w-3" strokeWidth={2} /> {t("settings.admins.replace")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveId(admin.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-md border border-[#DADEE5] px-2.5 py-1.5 text-xs font-medium text-[#1C2438] hover:border-[#C2542C] hover:text-[#C2542C] disabled:opacity-60"
                      >
                        <UserMinus className="h-3 w-3" strokeWidth={2} /> {t("settings.admins.remove")}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p className="mt-3 inline-flex items-center gap-1 text-sm text-[#8A3B3B]" role="alert">
          <AlertCircle className="h-4 w-4" strokeWidth={2} /> {error}
        </p>
      )}
      {success && !error && (
        <p className="mt-3 inline-flex items-center gap-1 text-sm text-[#2F6F5E]">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} /> {success}
        </p>
      )}

      {isPrimary && !panelOpen && slotsLeft > 0 && (
        <button
          type="button"
          onClick={() => openPanel(null)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px"
        >
          <UserPlus className="h-4 w-4" strokeWidth={2} /> {t("settings.admins.add")}
        </button>
      )}

      {isPrimary && panelOpen && (
        <form onSubmit={handleAdd} className="mt-5 rounded-lg border border-[#E4E7EE] bg-[#F7F8FA] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#1C2438]">
              {replaceTarget
                ? t("settings.admins.replaceTitle", { name: `${replaceTarget.firstName} ${replaceTarget.lastName}` })
                : t("settings.admins.newTitle")}
            </p>
            <button
              type="button"
              onClick={() => {
                setPanelOpen(false);
                setReplaceTarget(null);
              }}
              aria-label={t("common.close")}
              className="text-[#5B6478] hover:text-[#1C2438]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {replaceTarget && (
            <p className="mt-1 text-xs text-[#5B6478]">
              {t("settings.admins.replaceHint", { name: replaceTarget.firstName })}
            </p>
          )}

          <div className="mt-3 inline-flex rounded-lg border border-[#E2E4E9] bg-white p-0.5 text-sm">
            {(["promote", "create"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                  mode === m ? "bg-[#2F6F5E] text-white" : "text-[#5B6478] hover:text-[#1C2438]"
                }`}
              >
                {m === "promote" ? t("settings.admins.modePromote") : t("settings.admins.modeCreate")}
              </button>
            ))}
          </div>

          {mode === "promote" ? (
            <div className="mt-3">
              <label className="block text-sm font-medium text-[#1C2438]">{t("settings.admins.searchLabel")}</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 mt-0.5 h-4 w-4 -translate-y-1/2 text-[#9AA1B2]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("settings.admins.searchPlaceholder")}
                  className={`${inputClass} pl-9`}
                />
              </div>
              {candidates.length === 0 ? (
                <p className="mt-2 text-sm text-[#9AA1B2]">
                  {t("settings.admins.noCandidates")}
                </p>
              ) : (
                <ul className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[#E2E4E9] bg-white">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                          selectedId === c.id ? "bg-[#E7F3EF]" : "hover:bg-[#F7F8FA]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[#1C2438]">
                            {c.firstName} {c.lastName}
                          </span>
                          <span className="block truncate text-xs text-[#5B6478]">{c.email}</span>
                        </span>
                        {selectedId === c.id && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2F6F5E]" />}
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 && (
                    <li className="px-3 py-2 text-sm text-[#9AA1B2]">{t("settings.admins.noResults")}</li>
                  )}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-[#1C2438]">
                {t("auth.fields.firstName")}
                <input
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium text-[#1C2438]">
                {t("auth.fields.lastName")}
                <input
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium text-[#1C2438]">
                {t("auth.fields.email")}
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="text-sm font-medium text-[#1C2438]">
                {t("settings.admins.tempPassword")}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={inputClass}
                />
              </label>
              <p className="text-xs text-[#5B6478] sm:col-span-2">
                {t("settings.admins.passwordHint")}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" strokeWidth={2} />
            )}
            {replaceTarget ? t("settings.admins.confirmReplace") : t("settings.admins.grant")}
          </button>
        </form>
      )}
    </div>
  );
}
