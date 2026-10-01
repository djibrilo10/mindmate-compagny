"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, EyeOff, Loader2, Send, UserCheck } from "lucide-react";
import type { PrivacyInfo } from "@/lib/privacy";
import { PrivacyNotice } from "@/components/dashboard/PrivacyNotice";

// Formulaire de réponse à un sondage (voir AUDIT.md 7.23) : un choix par
// question, envoi unique. L'employé est clairement informé si ses réponses
// sont anonymes ou visibles par les admins AVANT de répondre.

type Question = { id: string; text: string; options: { id: string; label: string }[] };

export function SurveyAnswerForm({
  surveyId,
  isAnonymous,
  questions,
  privacy,
}: {
  surveyId: string;
  isAnonymous: boolean;
  questions: Question[];
  privacy: PrivacyInfo;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  // Sondage nominatif seulement : avis de confidentialité à accepter (Loi 25, 7.28).
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const complete = answeredCount === questions.length && (isAnonymous || privacyAccepted);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!complete) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch(`/api/surveys/${surveyId}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: questions.map((q) => ({ questionId: q.id, optionId: answers[q.id] })),
          privacyAccepted: isAnonymous ? undefined : privacyAccepted,
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

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-5">
      <p
        className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
          isAnonymous ? "bg-[#E7F3EF] text-[#265A4C]" : "bg-[#FDF3E3] text-[#6B5215]"
        }`}
      >
        {isAnonymous ? (
          <>
            <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Sondage anonyme : les administrateurs voient seulement
            les résultats globaux, jamais tes réponses personnelles.
          </>
        ) : (
          <>
            <UserCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Sondage nominatif : les administrateurs verront
            ton nom à côté de tes réponses.
          </>
        )}
      </p>

      {!isAnonymous && (
        <PrivacyNotice
          info={privacy}
          purpose="survey"
          accepted={privacyAccepted}
          onChange={setPrivacyAccepted}
        />
      )}

      {questions.map((q, qi) => (
        <fieldset key={q.id}>
          <legend className="text-sm font-medium text-[#1C2438]">
            {qi + 1}. {q.text}
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {q.options.map((o) => {
              const selected = answers[q.id] === o.id;
              return (
                <label
                  key={o.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selected
                      ? "border-[#2F6F5E] bg-[#E7F3EF] text-[#1C2438]"
                      : "border-[#E2E4E9] text-[#1C2438] hover:border-[#C7CBD6]"
                  }`}
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={o.id}
                    checked={selected}
                    onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                    className="accent-[#2F6F5E]"
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!complete || status === "loading"}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
          Envoyer mes réponses
        </button>
        <span className="text-xs text-[#9AA1B2]">
          {answeredCount} / {questions.length} question{questions.length > 1 ? "s" : ""}
          {!isAnonymous && !privacyAccepted ? " · coche « J'ai compris »" : ""}
        </span>
        {status === "error" && (
          <span className="inline-flex items-center gap-1 text-sm text-[#8A3B3B]">
            <AlertCircle className="h-4 w-4" strokeWidth={2} /> {error}
          </span>
        )}
      </div>
    </form>
  );
}
