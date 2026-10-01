"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";
import { DepartmentBadge } from "@/components/dashboard/DepartmentBadge";

type Role = "SUPER_ADMIN" | "ORG_ADMIN" | "MANAGER" | "EMPLOYEE";

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  ORG_ADMIN: "Admin",
  MANAGER: "Responsable",
  EMPLOYEE: "Employé",
};

type Counterpart = {
  id: string;
  firstName: string;
  lastName: string;
  role: Role;
  department?: { name: string; color: string } | null; // badge (AUDIT.md 7.34)
};

type ThreadSummary = {
  counterpart: Counterpart;
  lastMessage: { content: string; createdAt: string; fromMe: boolean };
  unreadCount: number;
};

type ThreadMessage = {
  id: string;
  content: string;
  createdAt: string;
  fromMe: boolean;
};

function formatThreadDate(iso: string) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

function initialsFrom(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function MessagesShell({
  initialThreads,
  canInitiate,
  employeesForPicker,
}: {
  initialThreads: ThreadSummary[];
  canInitiate: boolean;
  employeesForPicker: { id: string; firstName: string; lastName: string }[];
}) {
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCounterpart, setSelectedCounterpart] = useState<Counterpart | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setThreads(initialThreads);
  }, [initialThreads]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, selectedId]);

  async function openThread(counterpartId: string, fallback?: Counterpart) {
    setSelectedId(counterpartId);
    setSelectedCounterpart(fallback ?? null);
    setLoadingThread(true);
    setError("");

    try {
      const response = await fetch(`/api/messages/${counterpartId}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setSelectedCounterpart(data.counterpart);
      setMessages(data.messages);

      // La conversation vient d'être marquée comme lue côté serveur :
      // on retire son badge "non lu" localement sans refaire la liste entière.
      setThreads((current) =>
        current.map((t) => (t.counterpart.id === counterpartId ? { ...t, unreadCount: 0 } : t))
      );
    } catch {
      setError("Impossible de charger cette conversation.");
      setMessages([]);
    } finally {
      setLoadingThread(false);
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !selectedId) return;

    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId: selectedId, content: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erreur lors de l'envoi");

      setMessages((current) => [...current, data.message]);
      setDraft("");

      // Fait remonter/actualise cette conversation en tête de liste.
      setThreads((current) => {
        const rest = current.filter((t) => t.counterpart.id !== selectedId);
        const existing = current.find((t) => t.counterpart.id === selectedId);
        const counterpart = existing?.counterpart ?? selectedCounterpart;
        if (!counterpart) return current;
        return [
          {
            counterpart,
            lastMessage: { content: data.message.content, createdAt: data.message.createdAt, fromMe: true },
            unreadCount: 0,
          },
          ...rest,
        ];
      });

      // Resynchronise avec le serveur (utile si l'employé n'était pas
      // encore dans la liste, ou pour tout autre écran affichant ces données).
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSending(false);
    }
  }

  const employeesWithoutThread = employeesForPicker.filter(
    (employee) => !threads.some((t) => t.counterpart.id === employee.id)
  );

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[420px] overflow-hidden rounded-xl border border-[#E2E4E9] bg-white shadow-sm">
      {/* Liste des conversations */}
      <div
        className={`w-full shrink-0 overflow-y-auto border-r border-[#E2E4E9] md:block md:w-80 ${
          selectedId ? "hidden" : "block"
        }`}
      >
        {canInitiate && employeesWithoutThread.length > 0 && (
          <div className="border-b border-[#E2E4E9] p-3">
            <label className="block px-1 text-xs font-medium uppercase tracking-wide text-[#9AA1B2]">
              Nouvelle conversation
            </label>
            <select
              defaultValue=""
              onChange={(event) => {
                const employee = employeesWithoutThread.find((e) => e.id === event.target.value);
                if (employee) {
                  openThread(employee.id, { ...employee, role: "EMPLOYEE" });
                }
                event.target.value = "";
              }}
              className="mt-1 w-full rounded-lg border border-[#E2E4E9] px-2 py-1.5 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
            >
              <option value="" disabled>
                Choisir un employé...
              </option>
              {employeesWithoutThread.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName}
                </option>
              ))}
            </select>
          </div>
        )}

        {threads.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <MessageSquare className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
            <p className="text-sm text-[#5B6478]">
              {canInitiate
                ? "Aucune conversation pour le moment. Choisis un employé ci-dessus pour lui écrire."
                : "Aucune conversation pour le moment. Un membre de l'administration doit t'écrire en premier."}
            </p>
          </div>
        ) : (
          <ul>
            {threads.map((thread) => (
              <li key={thread.counterpart.id}>
                <button
                  onClick={() => openThread(thread.counterpart.id, thread.counterpart)}
                  className={`flex w-full items-start gap-2.5 border-b border-[#F1F2F4] px-4 py-3 text-left transition-colors hover:bg-[#F7F8FA] ${
                    selectedId === thread.counterpart.id ? "bg-[#F7F8FA]" : ""
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3D8C76] to-[#2F6F5E] text-[11px] font-semibold text-white">
                    {initialsFrom(thread.counterpart.firstName, thread.counterpart.lastName)}
                  </span>
                  <div className="min-w-0 flex-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1C2438]">
                        {thread.counterpart.firstName} {thread.counterpart.lastName}
                        <span className="ml-1.5 text-xs font-normal text-[#9AA1B2]">
                          {ROLE_LABELS[thread.counterpart.role]}
                        </span>
                        {thread.counterpart.department && (
                          <DepartmentBadge
                            name={thread.counterpart.department.name}
                            color={thread.counterpart.department.color}
                            className="ml-1.5"
                          />
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[#5B6478]">
                        {thread.lastMessage.fromMe ? "Toi : " : ""}
                        {thread.lastMessage.content}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-[#9AA1B2]">
                        {formatThreadDate(thread.lastMessage.createdAt)}
                      </span>
                      {thread.unreadCount > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2F6F5E] px-1.5 text-[11px] font-semibold text-white">
                          {thread.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Fil de la conversation sélectionnée */}
      <div className={`flex min-w-0 flex-1 flex-col ${selectedId ? "flex" : "hidden md:flex"}`}>
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <MessageSquare className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
            <p className="text-sm text-[#9AA1B2]">Sélectionne une conversation à gauche.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[#E2E4E9] px-4 py-3">
              <button
                onClick={() => setSelectedId(null)}
                className="text-[#5B6478] transition-colors hover:text-[#1C2438] md:hidden"
                aria-label="Retour à la liste"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2} />
              </button>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3D8C76] to-[#2F6F5E] text-[11px] font-semibold text-white">
                {selectedCounterpart
                  ? initialsFrom(selectedCounterpart.firstName, selectedCounterpart.lastName)
                  : "…"}
              </span>
              <p className="text-sm font-medium text-[#1C2438]">
                {selectedCounterpart
                  ? `${selectedCounterpart.firstName} ${selectedCounterpart.lastName}`
                  : "…"}
                {selectedCounterpart && (
                  <span className="ml-1.5 text-xs font-normal text-[#9AA1B2]">
                    {ROLE_LABELS[selectedCounterpart.role]}
                  </span>
                )}
                {selectedCounterpart?.department && (
                  <DepartmentBadge
                    name={selectedCounterpart.department.name}
                    color={selectedCounterpart.department.color}
                    className="ml-1.5"
                  />
                )}
              </p>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {loadingThread ? (
                <p className="text-sm text-[#9AA1B2]">Chargement…</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-[#9AA1B2]">Aucun message pour l'instant.</p>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                        message.fromMe
                          ? "bg-gradient-to-br from-[#3D8C76] to-[#265A4C] text-white"
                          : "bg-[#F7F8FA] text-[#1C2438]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      <p
                        className={`mt-1 text-[10px] ${
                          message.fromMe ? "text-white/70" : "text-[#9AA1B2]"
                        }`}
                      >
                        {formatThreadDate(message.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} className="border-t border-[#E2E4E9] p-3">
              {error && <p className="mb-2 text-xs text-[#8A3B3B]">{error}</p>}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend(event);
                    }
                  }}
                  rows={2}
                  placeholder="Écris un message..."
                  className="flex-1 resize-none rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px hover:shadow-[0_4px_14px_-2px_rgba(47,111,94,0.6)] disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  <Send className="h-4 w-4" strokeWidth={2} />
                  Envoyer
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
