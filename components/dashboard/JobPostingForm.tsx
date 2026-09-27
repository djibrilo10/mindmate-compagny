"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Briefcase, CheckCircle2, Loader2 } from "lucide-react";

export function JobPostingForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de la publication");
      }

      setTitle("");
      setDescription("");
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
        Nouveau poste
      </h2>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1C2438]">Titre du poste</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
            placeholder="Ex : Superviseur d'entrepôt"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1C2438]">Description</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
            rows={4}
            className="mt-1 w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
            placeholder="Tâches, exigences, horaire..."
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === "loading"}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px hover:shadow-[0_4px_14px_-2px_rgba(47,111,94,0.6)] disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Briefcase className="h-4 w-4" strokeWidth={2} />
            )}
            {status === "loading" ? "Publication..." : "Publier le poste"}
          </button>
          {status === "success" && (
            <span className="inline-flex items-center gap-1 text-sm text-[#2F6F5E]">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
              Poste publié.
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
