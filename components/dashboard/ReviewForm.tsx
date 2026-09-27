"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Send, Star } from "lucide-react";

export function ReviewForm() {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (rating === 0 || !comment.trim()) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment, isAnonymous }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de l'envoi");
      }

      setRating(0);
      setComment("");
      setIsAnonymous(true);
      setStatus("success");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm"
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg text-[#1C2438]">
        Laisser un avis
      </h2>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1C2438]">Note</label>
          <div className="mt-1 flex gap-1" onMouseLeave={() => setHoverRating(0)}>
            {[1, 2, 3, 4, 5].map((value) => {
              const filled = value <= (hoverRating || rating);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHoverRating(value)}
                  aria-label={`${value} étoile${value > 1 ? "s" : ""}`}
                  className="p-0.5 transition-transform hover:scale-110"
                >
                  <Star
                    className={filled ? "h-6 w-6 text-[#2F6F5E]" : "h-6 w-6 text-[#E2E4E9]"}
                    strokeWidth={1.8}
                    fill={filled ? "currentColor" : "none"}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1C2438]">Commentaire</label>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            required
            rows={4}
            className="mt-1 w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
            placeholder="Qu'est-ce qui fonctionne bien ? Qu'est-ce qui pourrait être amélioré ?"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-[#5B6478]">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(event) => setIsAnonymous(event.target.checked)}
            className="h-4 w-4 rounded border-[#E2E4E9] accent-[#2F6F5E]"
          />
          Envoyer anonymement
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === "loading" || rating === 0 || !comment.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px hover:shadow-[0_4px_14px_-2px_rgba(47,111,94,0.6)] disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Send className="h-4 w-4" strokeWidth={2} />
            )}
            {status === "loading" ? "Envoi..." : "Envoyer l'avis"}
          </button>
          {status === "success" && (
            <span className="inline-flex items-center gap-1 text-sm text-[#2F6F5E]">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
              Merci, ton avis a été envoyé.
            </span>
          )}
          {status === "error" && (
            <span className="inline-flex items-center gap-1 text-sm text-[#8A3B3B]">
              <AlertCircle className="h-4 w-4" strokeWidth={2} />
              {errorMessage}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
