"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Search, UserMinus, X } from "lucide-react";

// Admin : enregistrer le départ d'un employé (voir AUDIT.md 7.26).
type Candidate = { id: string; firstName: string; lastName: string; email: string; department: string | null };

const TYPES = [
  { value: "RESIGNATION", label: "Démission" },
  { value: "END_OF_CONTRACT", label: "Fin de contrat" },
  { value: "DISMISSAL", label: "Licenciement" },
  { value: "RETIREMENT", label: "Retraite" },
  { value: "OTHER", label: "Autre" },
];

const inputClass =
  "w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12";

export function RecordDepartureForm({ candidates }: { candidates: Candidate[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [type, setType] = useState("RESIGNATION");
  const [lastDay, setLastDay] = useState("");
  const [sendSurvey, setSendSurvey] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? candidates.filter((c) => `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(q)) : candidates).slice(0, 8);
  }, [candidates, query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !lastDay) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/departures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, type, lastDay, sendSurvey }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Enregistrement impossible");
      setSuccess(
        sendSurvey
          ? `Départ enregistré. ${selected.firstName} a reçu le questionnaire de départ.`
          : "Départ enregistré (sans questionnaire)."
      );
      setOpen(false);
      setSelected(null);
      setQuery("");
      setLastDay("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setSuccess(null);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px"
        >
          <UserMinus className="h-4 w-4" strokeWidth={2} /> Enregistrer un départ
        </button>
        {success && (
          <span className="inline-flex items-center gap-1 text-xs text-[#2F6F5E]">
            <CheckCircle2 className="h-3.5 w-3.5" /> {success}
          </span>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#1C2438]">Enregistrer un départ</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="text-[#5B6478] hover:text-[#1C2438]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-[#1C2438]">Employé</label>
          {selected ? (
            <div className="mt-1 flex items-center justify-between rounded-lg border border-[#2F6F5E] bg-[#E7F3EF] px-3 py-2 text-sm">
              <span>
                {selected.firstName} {selected.lastName}
                {selected.department && <span className="text-[#5B6478]"> · {selected.department}</span>}
              </span>
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-[#2F6F5E] hover:underline">
                Changer
              </button>
            </div>
          ) : (
            <>
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9AA1B2]" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom ou courriel" className={`${inputClass} pl-9`} />
              </div>
              <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-[#E2E4E9]">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setSelected(c)} className="w-full px-3 py-2 text-left text-sm hover:bg-[#F7F8FA]">
                      <span className="block font-medium text-[#1C2438]">
                        {c.firstName} {c.lastName}
                      </span>
                      <span className="block text-xs text-[#5B6478]">
                        {c.email}
                        {c.department ? ` · ${c.department}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
                {matches.length === 0 && <li className="px-3 py-2 text-sm text-[#9AA1B2]">Aucun résultat.</li>}
              </ul>
            </>
          )}
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium text-[#1C2438]">
            Type de départ
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setSendSurvey(e.target.value !== "DISMISSAL");
              }}
              className={`${inputClass} mt-1`}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-[#1C2438]">
            Dernier jour de travail
            <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="flex items-start gap-2 text-sm text-[#1C2438]">
            <input type="checkbox" checked={sendSurvey} onChange={(e) => setSendSurvey(e.target.checked)} className="mt-1 accent-[#2F6F5E]" />
            <span>
              Envoyer le questionnaire de départ
              <span className="block text-xs text-[#5B6478]">
                L&apos;employé est notifié et le remplit dans « Mon départ ». Ne désactive son compte qu&apos;après sa réponse.
              </span>
            </span>
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!selected || !lastDay || busy}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" strokeWidth={2} />}
          Enregistrer
        </button>
        {error && (
          <span className="inline-flex items-center gap-1 text-sm text-[#8A3B3B]">
            <AlertCircle className="h-4 w-4" /> {error}
          </span>
        )}
      </div>
    </form>
  );
}
