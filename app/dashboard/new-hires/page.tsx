import { redirect } from "next/navigation";
import { PartyPopper, Sparkles, UserPlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";

// Visible par TOUS les employés de l'organisation (comme la liste des
// employés) : c'est pensé comme un mur d'accueil, pas un outil réservé à
// l'admin — les mêmes infos (nom, rôle, département) sont déjà visibles
// sur la page Employés pour tout le monde.
const NEW_BADGE_WINDOW_DAYS = 30;
const MAX_HIRES_SHOWN = 20;

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  ORG_ADMIN: "Admin",
  MANAGER: "Gérant",
  EMPLOYEE: "Employé",
};

function daysAgo(date: Date): number {
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function relativeLabel(days: number): string {
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} jours`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `Il y a ${weeks} semaine${weeks > 1 ? "s" : ""}`;
  }
  const months = Math.floor(days / 30);
  return `Il y a ${months} mois`;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export default async function NewHiresPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const hires = await prisma.user.findMany({
    where: {
      organizationId: ctx.organizationId,
      status: "ACTIVE",
      hireDate: { not: null },
      ...VISIBLE_USER,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      hireDate: true,
      department: { select: { name: true } },
    },
    orderBy: { hireDate: "desc" },
    take: MAX_HIRES_SHOWN,
  });

  const serialized = hires.map((hire) => {
    const days = daysAgo(hire.hireDate as Date);
    return {
      id: hire.id,
      firstName: hire.firstName,
      lastName: hire.lastName,
      role: hire.role,
      department: hire.department?.name ?? null,
      hireDateLabel: (hire.hireDate as Date).toLocaleDateString("fr-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      relativeLabel: relativeLabel(days),
      isNew: days <= NEW_BADGE_WINDOW_DAYS,
    };
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F5EAFB] text-[#7A3FA0]">
          <PartyPopper className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Nouvelles recrues
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            Les derniers arrivés dans l&apos;organisation — souhaite-leur la bienvenue !
          </p>
        </div>
      </div>

      {serialized.length === 0 ? (
        <div className="animate-fade-in-up stagger-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
          <UserPlus className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
          <p className="text-sm text-[#5B6478]">Aucun employé pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {serialized.map((hire, index) => (
            <div
              key={hire.id}
              style={{ animationDelay: `${Math.min(index, 10) * 0.04}s` }}
              className="animate-fade-in-up flex items-start gap-3 rounded-xl border border-[#E2E4E9] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3D8C76] to-[#2F6F5E] text-sm font-semibold text-white">
                {initials(hire.firstName, hire.lastName)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-[#1C2438]">
                    {hire.firstName} {hire.lastName}
                  </p>
                  {hire.isNew && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#E7F3EF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#2F6F5E]">
                      <Sparkles className="h-2.5 w-2.5" strokeWidth={2.2} />
                      Nouveau
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#5B6478]">
                  {ROLE_LABELS[hire.role] ?? hire.role}
                  {hire.department ? ` · ${hire.department}` : ""}
                </p>
                <p className="mt-1 text-xs text-[#9AA1B2]">
                  {hire.relativeLabel} · {hire.hireDateLabel}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
