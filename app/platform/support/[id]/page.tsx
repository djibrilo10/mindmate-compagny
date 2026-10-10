import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown } from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/platform-guard";
import { PlatformSupportThread } from "@/components/platform/PlatformSupportThread";

// Détail d'une demande de support côté propriétaire (voir AUDIT.md 7.24).
// Ouvrir la page marque la demande comme lue.
export default async function PlatformSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformOwner(); // AUDIT.md 7.50
  const { id } = await params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: {
      id: true,
      subject: true,
      status: true,
      unreadByPlatform: true,
      createdAt: true,
      organization: { select: { name: true, slug: true, status: true } },
      author: { select: { firstName: true, lastName: true, email: true, status: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          fromPlatform: true,
          content: true,
          createdAt: true,
          sender: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!ticket) notFound();

  if (ticket.unreadByPlatform) {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { unreadByPlatform: false } });
  }
  // Ouvrir la demande = lire aussi ses notifications -> le badge de la cloche
  // et de l'icône de l'app baisse d'autant (AUDIT.md 7.25).
  const session = await getServerSession(authOptions);
  const ownerId = (session?.user as { id?: string } | undefined)?.id;
  if (ownerId) {
    await prisma.notification.updateMany({
      where: { userId: ownerId, isRead: false, link: `/platform/support/${ticket.id}` },
      data: { isRead: true },
    });
  }

  return (
    <div className="max-w-3xl">
      <Link href="/platform/support" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[#2F6F5E] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Toutes les demandes
      </Link>

      <div className="animate-fade-in-up rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
        <h1 className="font-[family-name:var(--font-display)] text-xl text-[#1C2438]">{ticket.subject}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-1 text-sm text-[#5B6478]">
          <span className="font-medium text-[#1C2438]">{ticket.organization.name}</span>
          <span className="text-[#9AA1B2]">({ticket.organization.slug})</span>
          {ticket.organization.status === "SUSPENDED" && (
            <span className="rounded-full bg-[#FDECEC] px-2 py-0.5 text-[11px] font-medium text-[#8A3B3B]">Suspendue</span>
          )}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-[#5B6478]">
          <Crown className="h-3 w-3 text-[#8A6A1C]" /> Admin principal : {ticket.author.firstName} {ticket.author.lastName} ·{" "}
          {ticket.author.email}
          {ticket.author.status !== "ACTIVE" && " (compte désactivé)"}
        </p>
      </div>

      <div className="mt-4 animate-fade-in-up stagger-1">
        <PlatformSupportThread
          ticketId={ticket.id}
          status={ticket.status}
          messages={ticket.messages.map((m) => ({
            id: m.id,
            fromPlatform: m.fromPlatform,
            senderName: m.fromPlatform ? "Toi" : `${m.sender.firstName} ${m.sender.lastName}`,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
