"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, Send } from "lucide-react";

// Fil de discussion d'une demande de support, côté propriétaire (AUDIT.md 7.24).
// L'admin voit tes réponses signées "Djibril" (lib/support.ts), jamais ton compte.

type Message = { id: string; fromPlatform: boolean; senderName: string; content: string; createdAt: string };

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function PlatformSupportThread({
  ticketId,
  status,
  messages,
}: {
  ticketId: string;
  status: "OPEN" | "RESOLVED";
  messages: Message[];
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Envoi impossible");
      setReply("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(next: "OPEN" | "RESOLVED") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Échec");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
      <div className="space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.fromPlatform ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                m.fromPlatform ? "bg-[#2F6F5E] text-white" : "border border-[#E2E4E9] bg-[#F7F8FA] text-[#1C2438]"
              }`}
            >
              <p className={`text-[11px] font-medium ${m.fromPlatform ? "text-white/80" : "text-[#2A5A8A]"}`}>
                {m.senderName} · {formatDateTime(m.createdAt)}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="mt-5 space-y-2 border-t border-[#E2E4E9] pt-4">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          placeholder="Ta réponse (l'admin la verra signée « Djibril »)…"
          className="w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={busy || !reply.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Répondre
          </button>
          {status === "OPEN" ? (
            <button
              type="button"
              onClick={() => setStatus("RESOLVED")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2F6F5E] px-3 py-2 text-sm font-medium text-[#2F6F5E] hover:bg-[#E7F3EF] disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Marquer résolu
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStatus("OPEN")}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#DADEE5] px-3 py-2 text-sm font-medium text-[#1C2438] hover:border-[#2F6F5E] disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Rouvrir
            </button>
          )}
          {error && (
            <span className="inline-flex items-center gap-1 text-sm text-[#8A3B3B]">
              <AlertCircle className="h-4 w-4" /> {error}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
