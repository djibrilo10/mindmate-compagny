import Link from "next/link";
import { LifeBuoy, Crown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/platform-guard";

// ------------------------------------------------------------
// Boîte de réception du propriétaire : demandes envoyées par les admins
// principaux via "Contacter Djibril" (voir AUDIT.md 7.24). Garde SUPER_ADMIN
// posée dans app/platform/layout.tsx (+ middleware.ts).
// ------------------------------------------------------------

function formatDateTime(date: Date) {
  return date.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" });
}

export default async function PlatformSupportPage() {
  await requirePlatformOwner(); // AUDIT.md 7.50
  const tickets = await prisma.supportTicket.findMany({
    orderBy: [{ unreadByPlatform: "desc" }, { lastMessageAt: "desc" }],
    take: 200,
    select: {
      id: true,
      subject: true,
      status: true,
      unreadByPlatform: true,
      lastMessageAt: true,
      organization: { select: { name: true, slug: true } },
      author: { select: { firstName: true, lastName: true, email: true } },
      _count: { select: { messages: true } },
    },
  });
  const openCount = tickets.filter((t) => t.status === "OPEN").length;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F0FA] text-[#2A5A8A]">
          <LifeBuoy className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">Support</h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {openCount} demande{openCount > 1 ? "s" : ""} en cours. Seuls les admins principaux peuvent t&apos;écrire.
          </p>
        </div>
      </div>

      {tickets.length === 0 ? (
        <div className="animate-fade-in-up stagger-1 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center text-sm text-[#5B6478]">
          Aucune demande pour le moment.
        </div>
      ) : (
        <ul className="animate-fade-in-up stagger-1 divide-y divide-[#E2E4E9] overflow-hidden rounded-xl border border-[#E2E4E9] bg-white shadow-sm">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/platform/support/${t.id}`}
                className={`flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-[#F7F8FA] ${
                  t.unreadByPlatform ? "bg-[#F4F8FD]" : ""
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.unreadByPlatform ? "bg-[#2A5A8A]" : "bg-transparent"}`}
                  aria-label={t.unreadByPlatform ? "Non lu" : undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm text-[#1C2438] ${t.unreadByPlatform ? "font-semibold" : "font-medium"}`}>
                    {t.subject}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-[#5B6478]">
                    <span className="font-medium text-[#1C2438]">{t.organization.name}</span>
                    <span className="text-[#9AA1B2]">({t.organization.slug})</span>·
                    <Crown className="h-3 w-3 text-[#8A6A1C]" /> {t.author.firstName} {t.author.lastName} · {t.author.email}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      t.status === "RESOLVED" ? "bg-[#E7F3EF] text-[#2F6F5E]" : "bg-[#FDF3E3] text-[#8A6A1C]"
                    }`}
                  >
                    {t.status === "RESOLVED" ? "Résolu" : "En cours"}
                  </span>
                  <p className="mt-1 text-xs text-[#9AA1B2]">
                    {t._count.messages} message{t._count.messages > 1 ? "s" : ""} · {formatDateTime(t.lastMessageAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
