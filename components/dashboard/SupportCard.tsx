"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  LifeBuoy,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";

// ------------------------------------------------------------
// Paramètres > Contacter Djibril (voir AUDIT.md 7.24). Visible par l'admin
// PRINCIPAL uniquement (la page ne rend pas ce composant pour les autres).
// Les réponses du propriétaire arrivent ici, signées de son prénom.
// ------------------------------------------------------------

type Message = { id: string; fromPlatform: boolean; senderName: string; content: string; createdAt: string };
type Ticket = {
  id: string;
  subject: string;
  status: "OPEN" | "RESOLVED";
  unread: boolean;
  lastMessageAt: string;
  messages: Message[];
};

const inputClass =
  "w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12";

export function SupportCard({
  tickets,
  contactName,
  brand,
}: {
  tickets: Ticket[];
  contactName: string;
  brand: string;
}) {
  const router = useRouter();
  const { t, tx, formatDateTime } = useI18n();
  const [formOpen, setFormOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  async function post(url: string, payload: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("settings.support.sendFailed"));
    return data;
  }

  async function handleNew(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setError(null);
    setSuccess(null);
    try {
      await post("/api/support", { subject, message });
      setSubject("");
      setMessage("");
      setFormOpen(false);
      setSuccess(t("settings.support.sent", { name: contactName }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    } finally {
      setSending(false);
    }
  }

  async function handleReply(event: FormEvent, ticketId: string) {
    event.preventDefault();
    setReplying(true);
    setError(null);
    try {
      await post(`/api/support/${ticketId}/messages`, { message: reply });
      setReply("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    } finally {
      setReplying(false);
    }
  }

  function toggle(ticket: Ticket) {
    const next = openId === ticket.id ? null : ticket.id;
    setOpenId(next);
    setReply("");
    if (next && ticket.unread) {
      // Marque la réponse comme lue (sans bloquer l'affichage).
      fetch(`/api/support/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markRead: true }),
      })
        .then(() => router.refresh())
        .catch(() => {});
    }
  }

  return (
    <div className="max-w-3xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium text-[#1C2438]">
            <LifeBuoy className="h-4 w-4 text-[#2A5A8A]" strokeWidth={1.9} />
            {t("settings.support.title", { brand })}
          </h2>
          <p className="mt-1 text-sm text-[#5B6478]">
            {t("settings.support.description", { name: contactName })}
          </p>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={() => {
              setFormOpen(true);
              setSuccess(null);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px"
          >
            <Send className="h-4 w-4" strokeWidth={2} /> {t("settings.support.contact", { name: contactName })}
          </button>
        )}
      </div>

      {formOpen && (
        <form onSubmit={handleNew} className="mt-5 space-y-3 rounded-lg border border-[#E4E7EE] bg-[#F7F8FA] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#1C2438]">{t("settings.support.newMessage", { name: contactName })}</p>
            <button type="button" onClick={() => setFormOpen(false)} aria-label={t("common.close")} className="text-[#5B6478] hover:text-[#1C2438]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t("settings.support.subjectPlaceholder")}
            className={inputClass}
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder={t("settings.support.messagePlaceholder")}
            className={inputClass}
          />
          <button
            type="submit"
            disabled={sending || subject.trim().length < 3 || message.trim().length < 5}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />}
            {t("common.send")}
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

      {tickets.length > 0 && (
        <ul className="mt-5 divide-y divide-[#E4E7EE] rounded-lg border border-[#E4E7EE]">
          {tickets.map((ticket) => {
            const isOpen = openId === ticket.id;
            return (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => toggle(ticket)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F7F8FA]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[#1C2438]">
                      {ticket.subject}
                      {ticket.unread && (
                        <span className="rounded-full bg-[#2A5A8A] px-2 py-0.5 text-[11px] font-medium text-white">
                          {t("settings.support.newReply")}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          ticket.status === "RESOLVED" ? "bg-[#E7F3EF] text-[#2F6F5E]" : "bg-[#FDF3E3] text-[#8A6A1C]"
                        }`}
                      >
                        {ticket.status === "RESOLVED" ? t("settings.support.resolved") : t("settings.support.inProgress")}
                      </span>
                    </p>
                    <p className="text-xs text-[#9AA1B2]">
                      {t("settings.support.lastMessage", { date: formatDateTime(ticket.lastMessageAt) })}
                    </p>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-[#5B6478] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="space-y-3 border-t border-[#E4E7EE] bg-[#F7F8FA] px-4 py-4">
                    {ticket.messages.map((m) => (
                      <div key={m.id} className={`flex ${m.fromPlatform ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                            m.fromPlatform ? "border border-[#E2E4E9] bg-white text-[#1C2438]" : "bg-[#2F6F5E] text-white"
                          }`}
                        >
                          <p className={`text-[11px] font-medium ${m.fromPlatform ? "text-[#2A5A8A]" : "text-white/80"}`}>
                            {m.senderName} · {formatDateTime(m.createdAt)}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
                        </div>
                      </div>
                    ))}
                    <form onSubmit={(e) => handleReply(e, ticket.id)} className="flex items-end gap-2">
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        rows={2}
                        placeholder={t("settings.support.replyPlaceholder", { name: contactName })}
                        className={inputClass}
                      />
                      <button
                        type="submit"
                        disabled={replying || !reply.trim()}
                        aria-label={t("common.send")}
                        className="rounded-lg bg-[#2F6F5E] p-2.5 text-white disabled:opacity-50"
                      >
                        {replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
