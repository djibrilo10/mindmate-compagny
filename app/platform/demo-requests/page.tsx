import { Inbox, Mail, Phone, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/platform-guard";
import { DemoRequestHandledButton } from "@/components/platform/DemoRequestHandledButton";

// ------------------------------------------------------------
// Demandes de démo reçues par le formulaire de la page d'accueil publique
// (AUDIT.md 7.43). Garde SUPER_ADMIN posée dans app/platform/layout.tsx
// (+ middleware.ts). Les plus récentes à traiter en premier.
// ------------------------------------------------------------

function formatDateTime(date: Date) {
  return date.toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" });
}

export default async function PlatformDemoRequestsPage() {
  await requirePlatformOwner(); // AUDIT.md 7.50
  const requests = await prisma.demoRequest.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: 300,
  });
  const pending = requests.filter((r) => !r.handledAt);
  const handled = requests.filter((r) => r.handledAt);
  const ordered = [...pending, ...handled];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
          <Inbox className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">Demandes de démo</h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {pending.length} à traiter · envoyées depuis la page d&apos;accueil. Tu reçois aussi chaque demande par courriel.
          </p>
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="animate-fade-in-up stagger-1 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center text-sm text-[#5B6478]">
          Aucune demande pour le moment.
        </div>
      ) : (
        <ul className="animate-fade-in-up stagger-1 space-y-3">
          {ordered.map((r) => (
            <li
              key={r.id}
              className={`rounded-xl border bg-white p-4 shadow-sm ${r.handledAt ? "border-[#E2E4E9] opacity-70" : "border-[#2F6F5E]/40"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-[#1C2438]">{r.company}</p>
                  <p className="mt-0.5 text-sm text-[#5B6478]">
                    {r.name} · {formatDateTime(r.createdAt)} · {r.locale === "en" ? "anglais" : "français"}
                  </p>
                </div>
                <DemoRequestHandledButton id={r.id} handled={Boolean(r.handledAt)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
                <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 text-[#2F6F5E] hover:underline">
                  <Mail className="h-4 w-4" /> {r.email}
                </a>
                {r.phone && (
                  <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1.5 text-[#2F6F5E] hover:underline">
                    <Phone className="h-4 w-4" /> {r.phone}
                  </a>
                )}
                {r.companySize && (
                  <span className="inline-flex items-center gap-1.5 text-[#5B6478]">
                    <Users className="h-4 w-4" /> {r.companySize} employés
                  </span>
                )}
              </div>
              {r.message && <p className="mt-3 whitespace-pre-line rounded-lg bg-[#F7F8FA] px-3 py-2 text-sm text-[#1C2438]">{r.message}</p>}
              {r.handledAt && <p className="mt-2 text-xs text-[#5B6478]">Traitée le {formatDateTime(r.handledAt)}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
