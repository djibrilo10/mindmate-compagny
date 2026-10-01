"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, Check, Loader2, Pencil, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { DepartmentBadge } from "@/components/dashboard/DepartmentBadge";

// ------------------------------------------------------------
// Paramètres > Départements (AUDIT.md 7.34). Tous les admins voient la carte ;
// seul l'admin PRINCIPAL crée, renomme, recolore, supprime (avec déplacement
// des membres) et nomme/retire les responsables.
// ------------------------------------------------------------

export type DepartmentSetting = {
  id: string;
  name: string;
  color: string;
  memberCount: number;
  managers: { id: string; name: string }[];
};

const COLORS = ["#1F8A6E", "#E0A43A", "#3F6FB0", "#C9542C", "#8B6BC9", "#2A9FB0", "#5B6478", "#B0487A"];
const field =
  "rounded-lg border border-[#E2E4E9] px-3 py-1.5 text-sm focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12";

export function DepartmentsCard({
  departments,
  people,
  isPrimary,
}: {
  departments: DepartmentSetting[];
  people: { id: string; name: string }[];
  isPrimary: boolean;
}) {
  const router = useRouter();
  const { t, tx } = useI18n();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(COLORS[departments.length % COLORS.length]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [moveToId, setMoveToId] = useState("");
  const [managerFor, setManagerFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function call(key: string, url: string, init: RequestInit) {
    setBusy(key);
    setError("");
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const matches = useMemo(() => {
    const dept = departments.find((d) => d.id === managerFor);
    const already = new Set(dept?.managers.map((m) => m.id));
    const q = query.trim().toLowerCase();
    return people.filter((p) => !already.has(p.id) && (!q || p.name.toLowerCase().includes(q))).slice(0, 8);
  }, [people, query, managerFor, departments]);

  return (
    <div className="max-w-3xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <h2 className="flex items-center gap-2 text-sm font-medium text-[#1C2438]">
        <Building2 className="h-4 w-4 text-[#2F5FA6]" strokeWidth={1.9} /> {t("departments.card.title")}
      </h2>
      <p className="mt-1 text-sm text-[#5B6478]">{t("departments.card.description")}</p>
      <p className="mt-1 text-xs text-[#9AA1B2]">{t("departments.card.managerHint")}</p>
      {!isPrimary && <p className="mt-2 text-xs text-[#9AA1B2]">{t("departments.card.onlyPrimary")}</p>}

      {error && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[#8A3B3B]" role="alert">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      <ul className="mt-4 divide-y divide-[#E4E7EE] rounded-lg border border-[#E4E7EE]">
        {departments.map((d) => (
          <li key={d.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {editId === d.id ? (
                <span className="flex flex-1 items-center gap-1.5">
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={60} className={`${field} min-w-0 flex-1`} autoFocus />
                  <button
                    type="button"
                    aria-label={t("common.save")}
                    disabled={busy !== null}
                    onClick={async () => {
                      if (await call(`rename-${d.id}`, `/api/departments/${d.id}`, { method: "PATCH", body: JSON.stringify({ name: editName }) })) setEditId(null);
                    }}
                    className="rounded-md bg-[#2F6F5E] p-1.5 text-white disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" aria-label={t("common.cancel")} onClick={() => setEditId(null)} className="p-1.5 text-[#5B6478]">
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ) : (
                <span className="flex flex-1 flex-wrap items-center gap-2">
                  <DepartmentBadge name={d.name} color={d.color} className="text-xs" />
                  <span className="text-xs text-[#5B6478]">{t("departments.members", { count: d.memberCount })}</span>
                </span>
              )}
              {isPrimary && editId !== d.id && (
                <span className="flex items-center gap-1">
                  <span className="mr-1 flex gap-0.5" role="radiogroup" aria-label={t("leave.settings.color")}>
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={d.color === c}
                        aria-label={c}
                        disabled={busy !== null}
                        onClick={() => d.color !== c && call(`color-${d.id}`, `/api/departments/${d.id}`, { method: "PATCH", body: JSON.stringify({ color: c }) })}
                        className={`h-4 w-4 rounded-full border-2 ${d.color === c ? "border-[#1C2438]" : "border-white"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(d.id);
                      setEditName(d.name);
                    }}
                    aria-label={t("departments.card.rename")}
                    title={t("departments.card.rename")}
                    className="rounded-md p-1.5 text-[#5B6478] hover:bg-[#F3F5F8] hover:text-[#1C2438]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {departments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteId(deleteId === d.id ? null : d.id);
                        setMoveToId("");
                      }}
                      aria-label={t("departments.card.delete")}
                      title={t("departments.card.delete")}
                      className="rounded-md p-1.5 text-[#5B6478] hover:bg-[#FDECEC] hover:text-[#C2542C]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              )}
            </div>

            {deleteId === d.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#FDF3F0] px-3 py-2 text-sm">
                {d.memberCount > 0 && (
                  <>
                    <span className="text-[#6B3A2A]">{t("departments.card.moveMembers", { count: d.memberCount })}</span>
                    <select value={moveToId} onChange={(e) => setMoveToId(e.target.value)} className={`${field} bg-white`}>
                      <option value="">—</option>
                      {departments
                        .filter((x) => x.id !== d.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </select>
                  </>
                )}
                <button
                  type="button"
                  disabled={busy !== null || (d.memberCount > 0 && !moveToId)}
                  onClick={async () => {
                    if (await call(`delete-${d.id}`, `/api/departments/${d.id}`, { method: "DELETE", body: JSON.stringify({ moveToId }) })) setDeleteId(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-[#C2542C] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {busy === `delete-${d.id}` && <Loader2 className="h-3 w-3 animate-spin" />}
                  {t("departments.card.confirmDelete")}
                </button>
                <button type="button" onClick={() => setDeleteId(null)} className="text-xs text-[#5B6478]">
                  {t("common.cancel")}
                </button>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[#9AA1B2]">{t("departments.managers")} :</span>
              {d.managers.length === 0 && <span className="text-[#9AA1B2]">{t("departments.noManager")}</span>}
              {d.managers.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-[#F3F5F8] px-2 py-0.5 text-[#1C2438]">
                  {m.name}
                  {isPrimary && (
                    <button
                      type="button"
                      aria-label={t("departments.card.removeManager", { name: m.name })}
                      disabled={busy !== null}
                      onClick={() => call(`rm-${d.id}-${m.id}`, `/api/departments/${d.id}/managers/${m.id}`, { method: "DELETE" })}
                      className="text-[#9AA1B2] hover:text-[#C2542C]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
              {isPrimary && managerFor !== d.id && (
                <button
                  type="button"
                  onClick={() => {
                    setManagerFor(d.id);
                    setQuery("");
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#C7CBD6] px-2 py-0.5 text-[#2F6F5E] hover:border-[#2F6F5E]"
                >
                  <UserPlus className="h-3 w-3" /> {t("departments.card.addManager")}
                </button>
              )}
            </div>

            {isPrimary && managerFor === d.id && (
              <div className="mt-2 max-w-sm rounded-lg border border-[#E2E4E9] bg-[#F7F8FA] p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9AA1B2]" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("departments.card.searchPlaceholder")}
                    className={`${field} w-full bg-white pl-8`}
                    autoFocus
                  />
                </div>
                <ul className="mt-1 max-h-48 overflow-y-auto">
                  {matches.length === 0 && <li className="px-2 py-1.5 text-xs text-[#9AA1B2]">{t("departments.card.noResult")}</li>}
                  {matches.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={async () => {
                          if (await call(`add-${d.id}`, `/api/departments/${d.id}/managers`, { method: "POST", body: JSON.stringify({ userId: p.id }) })) setManagerFor(null);
                        }}
                        className="w-full rounded-md px-2 py-1.5 text-left text-sm text-[#1C2438] hover:bg-white disabled:opacity-60"
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setManagerFor(null)} className="mt-1 text-xs text-[#5B6478]">
                  {t("common.cancel")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {isPrimary && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={60}
            placeholder={t("departments.card.newPlaceholder")}
            className={`${field} min-w-0 flex-1 basis-48`}
          />
          <span className="flex gap-0.5" role="radiogroup" aria-label={t("leave.settings.color")}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={newColor === c}
                aria-label={c}
                onClick={() => setNewColor(c)}
                className={`h-5 w-5 rounded-full border-2 ${newColor === c ? "border-[#1C2438]" : "border-white"}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </span>
          <button
            type="button"
            disabled={newName.trim().length < 2 || busy !== null}
            onClick={async () => {
              if (await call("create", "/api/departments", { method: "POST", body: JSON.stringify({ name: newName, color: newColor }) })) {
                setNewName("");
                setNewColor(COLORS[(departments.length + 1) % COLORS.length]);
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t("departments.card.add")}
          </button>
        </div>
      )}
    </div>
  );
}
