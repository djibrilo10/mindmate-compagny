import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, CheckCircle2, ClipboardList, Lock, Settings } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { isSurveyOpen } from "@/lib/surveys";
import { SurveyAnswerForm } from "@/components/dashboard/SurveyAnswerForm";

// ------------------------------------------------------------
// Sondages (voir AUDIT.md 7.23).
// - Tout le monde : répondre aux sondages ouverts (une fois chacun).
// - Admins : en plus, lien vers les résultats de chaque sondage et vers
//   Paramètres pour en créer. La création reste dans Paramètres, comme
//   demandé ; les résultats s'affichent sur le tableau de bord.
// ------------------------------------------------------------

function formatDate(date: Date) {
  return date.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
}

export default async function SurveysPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const isAdmin = ctx.role === "ORG_ADMIN";

  const [surveys, myParticipations] = await Promise.all([
    prisma.survey.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        questions: {
          orderBy: { position: "asc" },
          include: { options: { orderBy: { position: "asc" }, select: { id: true, label: true } } },
        },
      },
    }),
    prisma.surveyParticipation.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      select: { surveyId: true },
    }),
  ]);
  const answered = new Set(myParticipations.map((p) => p.surveyId));

  const toAnswer = surveys.filter((s) => isSurveyOpen(s) && !answered.has(s.id));
  const others = surveys.filter((s) => !toAnswer.includes(s));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1EDFB] text-[#5B3E9C]">
            <ClipboardList className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">Sondages</h1>
            <p className="mt-0.5 text-sm text-[#5B6478]">
              {toAnswer.length > 0
                ? `${toAnswer.length} sondage${toAnswer.length > 1 ? "s" : ""} en attente de ta réponse.`
                : "Tu es à jour, aucun sondage en attente."}
            </p>
          </div>
        </div>
        {isAdmin && (
          <Link
            href="/dashboard/settings#sondages"
            className="inline-flex items-center gap-1.5 rounded-md border border-[#DADEE5] px-3 py-2 text-sm font-medium text-[#1C2438] hover:border-[#2F6F5E] hover:text-[#2F6F5E]"
          >
            <Settings className="h-4 w-4" strokeWidth={1.9} /> Créer / gérer dans Paramètres
          </Link>
        )}
      </div>

      {surveys.length === 0 && (
        <div className="animate-fade-in-up stagger-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
          <ClipboardList className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
          <p className="text-sm text-[#5B6478]">Aucun sondage pour le moment.</p>
        </div>
      )}

      <div className="space-y-4">
        {toAnswer.map((s, i) => (
          <div
            key={s.id}
            style={{ animationDelay: `${Math.min(i, 10) * 0.04}s` }}
            className="animate-fade-in-up rounded-xl border border-[#2F6F5E]/30 bg-white p-5 opacity-0 shadow-sm"
          >
            <p className="font-[family-name:var(--font-display)] text-lg text-[#1C2438]">{s.title}</p>
            {s.description && <p className="mt-1 text-sm text-[#5B6478]">{s.description}</p>}
            {s.closesAt && (
              <p className="mt-1 text-xs text-[#9AA1B2]">Répondre avant le {formatDate(s.closesAt)}</p>
            )}
            <SurveyAnswerForm
              surveyId={s.id}
              isAnonymous={s.isAnonymous}
              questions={s.questions.map((q) => ({ id: q.id, text: q.text, options: q.options }))}
            />
          </div>
        ))}

        {others.length > 0 && (
          <div className="animate-fade-in-up rounded-xl border border-[#E2E4E9] bg-white shadow-sm">
            <p className="border-b border-[#E2E4E9] px-5 py-3 text-sm font-medium text-[#1C2438]">
              {toAnswer.length > 0 ? "Autres sondages" : "Sondages"}
            </p>
            <ul className="divide-y divide-[#E2E4E9]">
              {others.map((s) => {
                const open = isSurveyOpen(s);
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#1C2438]">{s.title}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#5B6478]">
                        {answered.has(s.id) ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 text-[#2F6F5E]" /> Tu as répondu
                          </>
                        ) : !open ? (
                          <>
                            <Lock className="h-3 w-3" /> Fermé
                          </>
                        ) : null}
                        <span className="text-[#9AA1B2]">· {formatDate(s.createdAt)}</span>
                      </p>
                    </div>
                    {isAdmin && (
                      <Link
                        href={`/dashboard/surveys/${s.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-[#2F6F5E] px-2.5 py-1.5 text-xs font-medium text-[#2F6F5E] hover:bg-[#E7F3EF]"
                      >
                        <BarChart3 className="h-3 w-3" strokeWidth={2} /> Résultats
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}
