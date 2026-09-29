"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  Send,
  Trash2,
  Unlock,
  UserCheck,
  X,
} from "lucide-react";

// ------------------------------------------------------------
// Paramètres > Sondages (voir AUDIT.md 7.23) : création + gestion.
// Les employés répondent sur /dashboard/surveys ; les résultats s'affichent
// sur le tableau de bord et sur /dashboard/surveys/[id].
// ------------------------------------------------------------

const MAX_QUESTIONS = 10;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

type SurveySummary = {
  id: string;
  title: string;
  isAnonymous: boolean;
  isOpen: boolean;
  closesAt: string | null;
  createdAt: string;
  questionCount: number;
  respondents: number;
};

type DraftQuestion = { text: string; options: string[] };

const emptyQuestion = (): DraftQuestion => ({ text: "", options: ["", ""] });

// Modèles pour démarrer vite ; l'admin peut tout modifier ensuite.
const TEMPLATES: { label: string; title: string; questions: DraftQuestion[] }[] = [
  {
    label: "Productivité",
    title: "Sondage sur la productivité",
    questions: [
      {
        text: "Pensez-vous que la productivité doit s'améliorer ?",
        options: ["Oui", "Non", "Pas vraiment"],
      },
      {
        text: "Qu'est-ce qui freine le plus votre productivité ?",
        options: ["Manque d'outils", "Trop de réunions", "Charge de travail", "Communication", "Rien de particulier"],
      },
    ],
  },
  {
    label: "Satisfaction",
    title: "Satisfaction au travail",
    questions: [
      {
        text: "Dans l'ensemble, êtes-vous satisfait(e) de votre travail ?",
        options: ["Très satisfait", "Satisfait", "Peu satisfait", "Pas satisfait"],
      },
      {
        text: "Recommanderiez-vous l'entreprise à un proche ?",
        options: ["Oui", "Peut-être", "Non"],
      },
    ],
  },
];

const inputClass =
  "w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-CA", { year: "numeric", month: "short", day: "numeric" });
}

export function SurveyManager({ surveys, eligible }: { surveys: SurveySummary[]; eligible: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [closesAt, setClosesAt] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([emptyQuestion()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setDescription("");
    setIsAnonymous(true);
    setClosesAt("");
    setQuestions([emptyQuestion()]);
  }

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setTitle(t.title);
    setQuestions(t.questions.map((q) => ({ text: q.text, options: [...q.options] })));
  }

  function updateQuestion(qi: number, patch: Partial<DraftQuestion>) {
    setQuestions((qs) => qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)));
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          isAnonymous,
          // datetime-local -> ISO avec le fuseau du navigateur de l'admin
          closesAt: closesAt ? new Date(closesAt).toISOString() : "",
          questions: questions.map((q) => ({ text: q.text, options: q.options })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Impossible de créer le sondage.");
      reset();
      setOpen(false);
      setSuccess("Sondage publié : tous les employés ont été notifiés.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(id: string, status: "OPEN" | "CLOSED") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/surveys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Échec");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/surveys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Échec");
      setConfirmDeleteId(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusyId(null);
    }
  }

  const canSubmit =
    title.trim().length >= 3 &&
    questions.every((q) => q.text.trim().length >= 3 && q.options.filter((o) => o.trim()).length === q.options.length);

  return (
    <div className="max-w-3xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-[#1C2438]">
            <ClipboardList className="h-4 w-4 text-[#5B3E9C]" strokeWidth={1.9} />
            Sondages
          </h2>
          <p className="mt-1 text-sm text-[#5B6478]">
            Pose des questions à tes {eligible} employés actifs. Les résultats s&apos;affichent sur le tableau de bord.
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setSuccess(null);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px"
          >
            <Plus className="h-4 w-4" strokeWidth={2} /> Nouveau sondage
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleCreate} className="mt-5 space-y-4 rounded-lg border border-[#E4E7EE] bg-[#F7F8FA] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5B6478]">
              Partir d&apos;un modèle :
              {TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => applyTemplate(t)}
                  className="rounded-full border border-[#DADEE5] bg-white px-2.5 py-1 font-medium text-[#1C2438] hover:border-[#2F6F5E] hover:text-[#2F6F5E]"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="text-[#5B6478] hover:text-[#1C2438]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="block text-sm font-medium text-[#1C2438]">
            Titre
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mt-1`} placeholder="Ex. Sondage sur la productivité" />
          </label>
          <label className="block text-sm font-medium text-[#1C2438]">
            Description <span className="font-normal text-[#9AA1B2]">(optionnelle)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${inputClass} mt-1`}
              placeholder="Pourquoi ce sondage, ce que vous ferez des résultats…"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <fieldset className="rounded-lg border border-[#E2E4E9] bg-white p-3">
              <legend className="px-1 text-sm font-medium text-[#1C2438]">Réponses</legend>
              <label className="flex items-start gap-2 text-sm text-[#1C2438]">
                <input type="radio" checked={isAnonymous} onChange={() => setIsAnonymous(true)} className="mt-1 accent-[#2F6F5E]" />
                <span>
                  <span className="inline-flex items-center gap-1 font-medium"><EyeOff className="h-3.5 w-3.5" /> Anonymes</span>
                  <span className="block text-xs text-[#5B6478]">Résultats globaux seulement. Recommandé pour des réponses honnêtes.</span>
                </span>
              </label>
              <label className="mt-2 flex items-start gap-2 text-sm text-[#1C2438]">
                <input type="radio" checked={!isAnonymous} onChange={() => setIsAnonymous(false)} className="mt-1 accent-[#2F6F5E]" />
                <span>
                  <span className="inline-flex items-center gap-1 font-medium"><UserCheck className="h-3.5 w-3.5" /> Nominatives</span>
                  <span className="block text-xs text-[#5B6478]">Les admins voient qui a répondu quoi. Les employés en sont informés.</span>
                </span>
              </label>
            </fieldset>
            <label className="block text-sm font-medium text-[#1C2438]">
              Clôture automatique <span className="font-normal text-[#9AA1B2]">(optionnelle)</span>
              <input type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className={`${inputClass} mt-1`} />
              <span className="mt-1 block text-xs font-normal text-[#5B6478]">Sinon, tu le fermes toi-même quand tu veux.</span>
            </label>
          </div>

          <div className="space-y-3">
            {questions.map((q, qi) => (
              <div key={qi} className="rounded-lg border border-[#E2E4E9] bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#5B6478]">Question {qi + 1}</span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))}
                      className="inline-flex items-center gap-1 text-xs text-[#8A3B3B] hover:underline"
                    >
                      <Trash2 className="h-3 w-3" /> Retirer
                    </button>
                  )}
                </div>
                <input
                  value={q.text}
                  onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                  className={`${inputClass} mt-2`}
                  placeholder="Ex. Pensez-vous que la productivité doit s'améliorer ?"
                />
                <div className="mt-2 space-y-2">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <span className="w-5 text-right text-xs text-[#9AA1B2]">{oi + 1}.</span>
                      <input
                        value={opt}
                        onChange={(e) =>
                          updateQuestion(qi, { options: q.options.map((o, i) => (i === oi ? e.target.value : o)) })
                        }
                        className={inputClass}
                        placeholder={`Choix ${oi + 1}`}
                      />
                      {q.options.length > MIN_OPTIONS && (
                        <button
                          type="button"
                          onClick={() => updateQuestion(qi, { options: q.options.filter((_, i) => i !== oi) })}
                          aria-label="Retirer ce choix"
                          className="text-[#9AA1B2] hover:text-[#8A3B3B]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {q.options.length < MAX_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => updateQuestion(qi, { options: [...q.options, ""] })}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#2F6F5E] hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Ajouter un choix
                  </button>
                )}
              </div>
            ))}
            {questions.length < MAX_QUESTIONS && (
              <button
                type="button"
                onClick={() => setQuestions((qs) => [...qs, emptyQuestion()])}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-[#C7CBD6] px-3 py-2 text-sm font-medium text-[#1C2438] hover:border-[#2F6F5E] hover:text-[#2F6F5E]"
              >
                <Plus className="h-4 w-4" /> Ajouter une question
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
            Publier le sondage
          </button>
        </form>
      )}

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

      <div className="mt-5">
        {surveys.length === 0 ? (
          <p className="text-sm text-[#9AA1B2]">Aucun sondage pour le moment.</p>
        ) : (
          <ul className="divide-y divide-[#E4E7EE] rounded-lg border border-[#E4E7EE]">
            {surveys.map((s) => {
              const rate = eligible > 0 ? Math.min(100, Math.round((s.respondents / eligible) * 100)) : 0;
              const busy = busyId === s.id;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#1C2438]">
                      {s.title}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          s.isOpen ? "bg-[#E7F3EF] text-[#2F6F5E]" : "bg-[#F3F5F8] text-[#5B6478]"
                        }`}
                      >
                        {s.isOpen ? "Ouvert" : "Fermé"}
                      </span>
                      <span className="text-[11px] font-normal text-[#9AA1B2]">
                        {s.isAnonymous ? "Anonyme" : "Nominatif"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-[#5B6478]">
                      {s.questionCount} question{s.questionCount > 1 ? "s" : ""} · {s.respondents} réponse
                      {s.respondents > 1 ? "s" : ""} ({rate} %) · créé le {formatDate(s.createdAt)}
                      {s.closesAt && s.isOpen ? ` · clôture le ${formatDate(s.closesAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/surveys/${s.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-[#2F6F5E] px-2.5 py-1.5 text-xs font-medium text-[#2F6F5E] hover:bg-[#E7F3EF]"
                    >
                      <BarChart3 className="h-3 w-3" strokeWidth={2} /> Résultats
                    </Link>
                    {confirmDeleteId === s.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => remove(s.id)}
                          disabled={busy}
                          className="rounded-md bg-[#C2542C] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#A8451F] disabled:opacity-60"
                        >
                          Supprimer définitivement
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-xs text-[#5B6478]">
                          Annuler
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setStatus(s.id, s.isOpen ? "CLOSED" : "OPEN")}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md border border-[#DADEE5] px-2.5 py-1.5 text-xs font-medium text-[#1C2438] hover:border-[#2F6F5E] hover:text-[#2F6F5E] disabled:opacity-60"
                        >
                          {busy ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : s.isOpen ? (
                            <Lock className="h-3 w-3" />
                          ) : (
                            <Unlock className="h-3 w-3" />
                          )}
                          {s.isOpen ? "Fermer" : "Rouvrir"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(s.id)}
                          disabled={busy}
                          aria-label="Supprimer le sondage"
                          className="rounded-md border border-[#DADEE5] p-1.5 text-[#5B6478] hover:border-[#C2542C] hover:text-[#C2542C] disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
