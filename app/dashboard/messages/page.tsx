import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { MessageSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { MessagesShell } from "@/components/dashboard/MessagesShell";
import { managedByWhere } from "@/lib/departments";

const MANAGEMENT_ROLES: Role[] = ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"];

export default async function MessagesPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const canInitiate = MANAGEMENT_ROLES.includes(ctx.role);

  // On récupère tous les messages où l'utilisateur est expéditeur OU
  // destinataire, puis on les regroupe par "conversation" (une ligne par
  // personne avec qui il a échangé). Volume attendu modeste pour l'instant :
  // pas besoin d'une requête SQL groupée plus complexe.
  const allMessages = await prisma.message.findMany({
    where: {
      organizationId: ctx.organizationId,
      OR: [{ senderId: ctx.userId }, { receiverId: ctx.userId }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true, department: { select: { name: true, color: true } } } },
      receiver: { select: { id: true, firstName: true, lastName: true, role: true, department: { select: { name: true, color: true } } } },
    },
  });

  type ThreadSummary = {
    counterpart: {
      id: string;
      firstName: string;
      lastName: string;
      role: Role;
      department: { name: string; color: string } | null;
    };
    lastMessage: { content: string; createdAt: string; fromMe: boolean };
    unreadCount: number;
  };

  const threadsByCounterpart = new Map<string, ThreadSummary>();
  for (const message of allMessages) {
    const fromMe = message.senderId === ctx.userId;
    const counterpart = fromMe ? message.receiver : message.sender;
    const unread = !fromMe && !message.isRead;

    const existing = threadsByCounterpart.get(counterpart.id);
    if (!existing) {
      // allMessages est trié du plus récent au plus ancien : la première
      // fois qu'on croise cette personne, c'est donc son dernier message.
      threadsByCounterpart.set(counterpart.id, {
        counterpart,
        lastMessage: {
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          fromMe,
        },
        unreadCount: unread ? 1 : 0,
      });
    } else if (unread) {
      existing.unreadCount += 1;
    }
  }
  const threads = Array.from(threadsByCounterpart.values());

  // Seul un admin/gérant peut démarrer une nouvelle conversation : on lui
  // propose la liste des employés actifs de son organisation.
  const employeesForPicker = canInitiate
    ? await prisma.user.findMany({
        // Admin : tous les employés. Responsable : seulement les membres des
        // départements qu'il gère (AUDIT.md 7.34).
        where: {
          organizationId: ctx.organizationId,
          status: "ACTIVE",
          id: { not: ctx.userId },
          ...(ctx.role === "MANAGER"
            ? { role: { in: ["EMPLOYEE", "MANAGER"] as Role[] }, ...managedByWhere(ctx.userId) }
            : { role: "EMPLOYEE" as const }),
        },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      })
    : [];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
          <MessageSquare className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Messages
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {canInitiate
              ? "Écris à un employé ou continue une conversation existante."
              : "Réponds aux messages que l'administration ou ton responsable t'a envoyés."}
          </p>
        </div>
      </div>

      <div className="animate-fade-in-up stagger-1">
        <MessagesShell
          initialThreads={threads}
          canInitiate={canInitiate}
          employeesForPicker={employeesForPicker}
        />
      </div>
    </div>
  );
}
