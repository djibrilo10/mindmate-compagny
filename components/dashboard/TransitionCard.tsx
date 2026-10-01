"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BadgeCheck,
  CalendarPlus,
  CheckCircle2,
  Circle,
  Crown,
  Loader2,
  MapPin,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { DEFAULT_HANDOVER_ITEMS, MAX_HANDOVER_ITEMS, type HandoverItem } from "@/lib/retention-config";
import { LocalDateTime } from "@/components/dashboard/LocalDateTime";

// ------------------------------------------------------------
// Fin d'emploi & transition (voir AUDIT.md 7.27) — sur la fiche d'un départ.
// L'ADMIN PRINCIPAL confirme la fin d'emploi, planifie le rendez-vous de
// transition (date, lieu, consignes, liste de remise) et coche la remise au
// fur et à mesure. Les co-admins voient tout en lecture seule.
// ------------------------------------------------------------

type Props = {
  departureId: string;
  employeeFirstName: string;
  isPrimary: boolean;
  confirmedAt: string | null;
  confirmedByName: string | null;
  transitionAt: string | null;
  location: string | null;
  notes: string | null;
  items: HandoverItem[];
  closedAt: string | null;
  accountActive: boolean;
};

const inputClass =
  "w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12";

/** ISO -> valeur pour <input type="datetime-local"> dans le fuseau du navigateur. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TransitionCard(props: Props) {
  const router = useRouter();
  const [items, setItems] = useState<HandoverItem[]>(props.items);
  const [editing, setEditing] = useState(false);
  const [when, setWhen] = useState(toLocalInput(props.transitionAt));
  const [location, setLocation] = useState(props.location ?? "");
  const [notes, setNotes] = useState(props.notes ?? "");
  const [labels, setLabels] = useState<string[]>(props.items.length ? props.items.map((i) => i.label) : DEFAULT_HANDOVER_ITEMS);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doneCount = items.filter((i) => i.done).length;
  const allDone = items.length > 0 && doneCount === items.length;

  async function patch(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/departures/${props.departureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "L'opération a échoué");
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function schedule(event: FormEvent) {
    event.preventDefault();
    if (!when) return;
    const ok = await patch("schedule", {
      transitionAt: new Date(when).toISOString(),
      location,
      notes,
      items: labels,
    });
    if (ok) {
      setEditing(false);
      router.refresh();
    }
  }

  async function toggleItem(item: HandoverItem) {
    const next = items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i));
    setItems(next); // optimiste
    const data = await patch("checklist", { items: next.map(({ id, done }) => ({ id, done })) });
    if (data?.items) setItems(data.items);
    else setItems(items);
  }

  return (
    <section className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9AA1B2]">Fin d&apos;emploi &amp; transition</p>
          {!props.isPrimary && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-[#8A6A1C]">
              <Crown className="h-3 w-3" /> Géré par l&apos;administrateur principal (lecture seule)
            </p>
          )}
        </div>
        {props.closedAt ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F3EF] px-2.5 py-1 text-xs font-medium text-[#2F6F5E]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Transition terminée
          </span>
        ) : props.confirmedAt ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#E7F0FA] px-2.5 py-1 text-xs font-medium text-[#2A5A8A]">
            <BadgeCheck className="h-3.5 w-3.5" /> Fin d&apos;emploi confirmée
          </span>
        ) : (
          <span className="rounded-full bg-[#FDF3E3] px-2.5 py-1 text-xs font-medium text-[#8A6A1C]">À confirmer</span>
        )}
      </div>

      {/* 1. Confirmation */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#F7F8FA] px-4 py-3">
        <p className="text-sm text-[#1C2438]">
          {props.confirmedAt ? (
            <>
              Confirmée le <LocalDateTime iso={props.confirmedAt} withTime={false} />
              {props.confirmedByName ? ` par ${props.confirmedByName}` : ""}.
            </>
          ) : (
            "La fin d'emploi n'est pas encore confirmée."
          )}
        </p>
        {props.isPrimary && !props.confirmedAt && (
          <button
            type="button"
            onClick={async () => (await patch("confirm")) && router.refresh()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            Confirmer la fin d&apos;emploi
          </button>
        )}
      </div>

      {/* 2. Rendez-vous */}
      {editing ? (
        <form onSubmit={schedule} className="mt-4 space-y-3 rounded-lg border border-[#E2E4E9] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#1C2438]">Rendez-vous de transition avec {props.employeeFirstName}</p>
            <button type="button" onClick={() => setEditing(false)} aria-label="Fermer" className="text-[#5B6478] hover:text-[#1C2438]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-[#1C2438]">
              Date et heure
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${inputClass} mt-1`} />
            </label>
            <label className="text-sm font-medium text-[#1C2438]">
              Lieu <span className="font-normal text-[#9AA1B2]">(ou lien visio)</span>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex. Bureau RH, 2e étage" className={`${inputClass} mt-1`} />
            </label>
          </div>
          <label className="block text-sm font-medium text-[#1C2438]">
            Consignes pour l&apos;employé <span className="font-normal text-[#9AA1B2]">(facultatif)</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} mt-1`} placeholder="Ex. Apporter le portable et le badge." />
          </label>
          <div>
            <p className="text-sm font-medium text-[#1C2438]">À remettre / à faire</p>
            <ul className="mt-2 space-y-1.5">
              {labels.map((label, i) => (
                <li key={`${label}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-[#F7F8FA] px-3 py-1.5 text-sm text-[#1C2438]">
                  {label}
                  <button type="button" onClick={() => setLabels((l) => l.filter((_, j) => j !== i))} aria-label="Retirer" className="text-[#9AA1B2] hover:text-[#8A3B3B]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            {labels.length < MAX_HANDOVER_ITEMS && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (newLabel.trim()) {
                        setLabels((l) => [...l, newLabel.trim()]);
                        setNewLabel("");
                      }
                    }
                  }}
                  placeholder="Ajouter un élément (ex. carte de crédit d'entreprise)"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newLabel.trim()) {
                      setLabels((l) => [...l, newLabel.trim()]);
                      setNewLabel("");
                    }
                  }}
                  className="rounded-lg border border-[#DADEE5] px-3 text-[#1C2438] hover:border-[#2F6F5E] hover:text-[#2F6F5E]"
                  aria-label="Ajouter"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={!when || busy !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy === "schedule" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {props.transitionAt ? "Mettre à jour et prévenir l'employé" : "Planifier et prévenir l'employé"}
          </button>
        </form>
      ) : props.transitionAt ? (
        <div className="mt-4 rounded-lg border border-[#E2E4E9] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="text-sm text-[#1C2438]">
              <p className="flex items-center gap-1.5 font-medium">
                <CalendarPlus className="h-4 w-4 text-[#2F6F5E]" /> <LocalDateTime iso={props.transitionAt} />
              </p>
              {props.location && (
                <p className="mt-1 flex items-center gap-1.5 text-[#5B6478]">
                  <MapPin className="h-4 w-4" /> {props.location}
                </p>
              )}
              {props.notes && <p className="mt-2 whitespace-pre-wrap text-[#5B6478]">{props.notes}</p>}
            </div>
            {props.isPrimary && !props.closedAt && (
              <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-[#2F6F5E] hover:underline">
                Modifier
              </button>
            )}
          </div>

          {items.length > 0 && (
            <>
              <div className="mt-4 flex items-center justify-between text-xs text-[#5B6478]">
                <span>Liste de remise</span>
                <span className="tabular-nums">
                  {doneCount} / {items.length}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-[#EEF0F4]">
                <div className="h-full rounded-full bg-[#2F6F5E] transition-[width]" style={{ width: `${(doneCount / items.length) * 100}%` }} />
              </div>
              <ul className="mt-3 space-y-1">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={!props.isPrimary || !!props.closedAt}
                      onClick={() => toggleItem(item)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors enabled:hover:bg-[#F7F8FA] disabled:cursor-default"
                    >
                      {item.done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2F6F5E]" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-[#B7BECC]" />
                      )}
                      <span className={item.done ? "text-[#5B6478] line-through" : "text-[#1C2438]"}>{item.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : props.isPrimary ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-[#C7CBD6] px-4 py-3 text-sm font-medium text-[#1C2438] hover:border-[#2F6F5E] hover:text-[#2F6F5E]"
        >
          <CalendarPlus className="h-4 w-4" /> Planifier un rendez-vous de transition (dossiers, clés, accès)
        </button>
      ) : (
        <p className="mt-4 text-sm text-[#9AA1B2]">Aucun rendez-vous de transition planifié.</p>
      )}

      {/* 3. Clôture */}
      {props.isPrimary && props.transitionAt && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#E2E4E9] pt-4">
          {props.closedAt ? (
            <button
              type="button"
              onClick={async () => (await patch("reopen")) && router.refresh()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#DADEE5] px-3 py-1.5 text-xs font-medium text-[#1C2438] hover:border-[#2F6F5E]"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Rouvrir la transition
            </button>
          ) : (
            <button
              type="button"
              onClick={async () => (await patch("close")) && router.refresh()}
              disabled={busy !== null || !allDone}
              title={allDone ? undefined : "Coche d'abord tous les éléments de la liste de remise"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "close" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Marquer la transition terminée
            </button>
          )}
          {props.accountActive && (
            <p className="text-xs text-[#5B6478]">
              Le compte de {props.employeeFirstName} est encore actif : désactive-le depuis la page Employés quand tu le souhaites.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 inline-flex items-center gap-1 text-sm text-[#8A3B3B]" role="alert">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}
    </section>
  );
}
