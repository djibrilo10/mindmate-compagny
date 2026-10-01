"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Send, Star } from "lucide-react";
import {
  LEVERS,
  RATING_DIMENSIONS,
  RATING_KEYS,
  REASONS,
  REASON_CODES,
  TRI_LABELS,
  type LeverCode,
  type RatingKey,
  type ReasonCode,
} from "@/lib/retention-config";
import type { PrivacyInfo } from "@/lib/privacy";
import { PrivacyNotice } from "@/components/dashboard/PrivacyNotice";

// ------------------------------------------------------------
// Questionnaire de départ (voir AUDIT.md 7.26). Deux usages :
// - askLastDay = true  : l'employé annonce lui-même sa démission ;
// - askLastDay = false : un admin a déjà enregistré le départ.
// ------------------------------------------------------------

type Tri = "YES" | "MAYBE" | "NO";

const inputClass =
  "w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12";

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
      <legend className="sr-only">{title}</legend>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#9AA1B2]">Étape {n}</p>
      <p className="mt-1 text-base font-medium text-[#1C2438]">{title}</p>
      {hint && <p className="mt-0.5 text-sm text-[#5B6478]">{hint}</p>}
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
        selected ? "border-[#2F6F5E] bg-[#E7F3EF] text-[#1C2438]" : "border-[#E2E4E9] text-[#1C2438] hover:border-[#C7CBD6]"
      }`}
    >
      {children}
    </button>
  );
}

function TriChoice({ value, onChange }: { value: Tri | null; onChange: (v: Tri) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(["YES", "MAYBE", "NO"] as Tri[]).map((v) => (
        <Chip key={v} selected={value === v} onClick={() => onChange(v)}>
          {TRI_LABELS[v]}
        </Chip>
      ))}
    </div>
  );
}

export function DepartureSurveyForm({ askLastDay, privacy }: { askLastDay: boolean; privacy: PrivacyInfo }) {
  const router = useRouter();
  const [lastDay, setLastDay] = useState("");
  const [primary, setPrimary] = useState<ReasonCode | null>(null);
  const [secondary, setSecondary] = useState<ReasonCode[]>([]);
  const [details, setDetails] = useState<string[]>([]);
  const [ratings, setRatings] = useState<Partial<Record<RatingKey, number>>>({});
  const [couldBeRetained, setCouldBeRetained] = useState<Tri | null>(null);
  const [lever, setLever] = useState<LeverCode | null>(null);
  const [wouldRecommend, setWouldRecommend] = useState<Tri | null>(null);
  const [wouldReturn, setWouldReturn] = useState<Tri | null>(null);
  const [comment, setComment] = useState("");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const selectedReasons = [primary, ...secondary].filter(Boolean) as ReasonCode[];
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const missing: string[] = [];
  if (askLastDay && !lastDay) missing.push("dernier jour");
  if (!primary) missing.push("raison principale");
  if (RATING_KEYS.some((k) => !ratings[k])) missing.push("notes");
  if (!couldBeRetained) missing.push("rétention");
  if (!wouldRecommend || !wouldReturn) missing.push("recommandation");
  if (!privacyAccepted) missing.push("avis de confidentialité");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (missing.length > 0) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/departures/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastDay: askLastDay ? lastDay : undefined,
          privacyAccepted,
          answers: {
            primaryReason: primary,
            secondaryReasons: secondary,
            details,
            ...ratings,
            couldBeRetained,
            retentionLever: couldBeRetained === "NO" ? undefined : lever ?? undefined,
            wouldRecommend,
            wouldReturn,
            comment: comment.trim() || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Envoi impossible");
      router.refresh();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    }
  }

  let step = 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PrivacyNotice
        info={privacy}
        purpose="departure"
        accepted={privacyAccepted}
        onChange={setPrivacyAccepted}
      />

      {askLastDay && (
        <Section n={++step} title="Quel sera ton dernier jour de travail ?">
          <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} className={`${inputClass} max-w-xs`} />
        </Section>
      )}

      <Section n={++step} title="Quelle est la raison PRINCIPALE de ton départ ?" hint="Un seul choix.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {REASON_CODES.map((code) => (
            <Chip
              key={code}
              selected={primary === code}
              onClick={() => {
                setPrimary(code);
                setSecondary((s) => s.filter((x) => x !== code));
              }}
            >
              {REASONS[code].label}
            </Chip>
          ))}
        </div>
      </Section>

      <Section n={++step} title="Y a-t-il d'autres raisons ?" hint="Facultatif, plusieurs choix possibles.">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {REASON_CODES.filter((c) => c !== primary).map((code) => (
            <Chip key={code} selected={secondary.includes(code)} onClick={() => setSecondary((s) => toggle(s, code))}>
              {REASONS[code].label}
            </Chip>
          ))}
        </div>
      </Section>

      {selectedReasons.some((c) => Object.keys(REASONS[c].details).length > 0) && (
        <Section n={++step} title="Peux-tu préciser ?" hint="Coche tout ce qui s'applique.">
          <div className="space-y-4">
            {selectedReasons
              .filter((c) => Object.keys(REASONS[c].details).length > 0)
              .map((code) => (
                <div key={code}>
                  <p className="text-sm font-medium text-[#1C2438]">{REASONS[code].label}</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {Object.entries(REASONS[code].details).map(([dCode, label]) => (
                      <Chip key={dCode} selected={details.includes(dCode)} onClick={() => setDetails((d) => toggle(d, dCode))}>
                        {label}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </Section>
      )}

      <Section n={++step} title="Comment évalues-tu ces aspects de ton travail ici ?" hint="1 = très insatisfait, 5 = très satisfait.">
        <div className="space-y-3">
          {RATING_KEYS.map((key) => (
            <div key={key} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-[#1C2438]">{RATING_DIMENSIONS[key]}</span>
              <div className="flex gap-1" role="radiogroup" aria-label={RATING_DIMENSIONS[key]}>
                {[1, 2, 3, 4, 5].map((v) => {
                  const filled = v <= (ratings[key] ?? 0);
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={ratings[key] === v}
                      aria-label={`${v} sur 5`}
                      onClick={() => setRatings((r) => ({ ...r, [key]: v }))}
                      className="p-0.5 transition-transform hover:scale-110"
                    >
                      <Star
                        className={filled ? "h-6 w-6 text-[#2F6F5E]" : "h-6 w-6 text-[#E2E4E9]"}
                        fill={filled ? "currentColor" : "none"}
                        strokeWidth={1.8}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section n={++step} title="Aurait-on pu te retenir ?">
        <TriChoice value={couldBeRetained} onChange={setCouldBeRetained} />
        {couldBeRetained && couldBeRetained !== "NO" && (
          <div className="mt-4">
            <p className="text-sm font-medium text-[#1C2438]">Qu&apos;est-ce qui t&apos;aurait fait rester ?</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(LEVERS) as LeverCode[]).map((code) => (
                <Chip key={code} selected={lever === code} onClick={() => setLever(code)}>
                  {LEVERS[code]}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section n={++step} title="Pour finir">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm text-[#1C2438]">Recommanderais-tu l&apos;entreprise à un proche ?</p>
            <TriChoice value={wouldRecommend} onChange={setWouldRecommend} />
          </div>
          <div>
            <p className="mb-2 text-sm text-[#1C2438]">Pourrais-tu revenir travailler ici un jour ?</p>
            <TriChoice value={wouldReturn} onChange={setWouldReturn} />
          </div>
          <label className="block text-sm text-[#1C2438]">
            Un commentaire ou une suggestion ? <span className="text-[#9AA1B2]">(facultatif)</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={2000}
              className={`${inputClass} mt-1`}
              placeholder="Ce qui aurait pu être fait différemment, ce qui fonctionnait bien…"
            />
          </label>
        </div>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={missing.length > 0 || status === "loading"}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-5 py-2.5 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
          {askLastDay ? "Annoncer mon départ" : "Envoyer le questionnaire"}
        </button>
        {missing.length > 0 && <span className="text-xs text-[#9AA1B2]">À compléter : {missing.join(", ")}</span>}
        {status === "error" && (
          <span className="inline-flex items-center gap-1 text-sm text-[#8A3B3B]">
            <AlertCircle className="h-4 w-4" /> {error}
          </span>
        )}
      </div>
    </form>
  );
}
