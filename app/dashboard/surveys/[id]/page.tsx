import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { getSurveyResults } from "@/lib/surveys";
import { SurveyResultsView } from "@/components/dashboard/SurveyResultsView";

// Analyse complète d'un sondage — réservée aux admins (principal et
// co-admins), voir AUDIT.md 7.23. Les employés n'y ont pas accès.
export default async function SurveyResultsPage({ params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  if (ctx.role !== "ORG_ADMIN") redirect("/dashboard/surveys");

  const { id } = await params;
  const results = await getSurveyResults(id, ctx.organizationId); // filtré par organisation
  if (!results) notFound();

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1EDFB] text-[#5B3E9C]">
            <BarChart3 className="h-5 w-5" strokeWidth={1.9} />
          </span>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">Résultats du sondage</h1>
            <p className="mt-0.5 text-sm text-[#5B6478]">Analyse détaillée, question par question.</p>
          </div>
        </div>
        <Link
          href="/dashboard/settings#sondages"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2F6F5E] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Tous les sondages
        </Link>
      </div>
      <div className="animate-fade-in-up stagger-1">
        <SurveyResultsView results={results} />
      </div>
    </div>
  );
}
