import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  EyeOff,
  Lightbulb,
  ListChecks,
  Lock,
  UserCheck,
  Users,
} from "lucide-react";
import type { SurveyResults } from "@/lib/surveys";
import { MIN_GROUP_SIZE } from "@/lib/surveys";

// ------------------------------------------------------------
// Affichage des résultats d'un sondage (voir AUDIT.md 7.23). Composant
// serveur, sans bibliothèque de graphiques : barres HTML/CSS.
// - Par question : barres horizontales d'une seule teinte (la longueur
//   porte la valeur) ; le choix en tête est en teinte foncée, les autres en
//   teinte claire. Chaque barre porte son % et son nombre en texte : la
//   couleur n'est jamais la seule information.
// - Par département : barres empilées 100 %, une couleur FIXE par choix
//   (ordre de la palette validée CVD, voir OPTION_COLORS), légende toujours
//   présente, séparation de 2px entre segments, % écrit dans le segment
//   quand il y a la place, infobulle au survol sur chaque segment.
// compact = version tableau de bord (2 premières questions, pas de
// ventilation) avec lien vers l'analyse complète.
// ------------------------------------------------------------

// Palette catégorielle validée (scripts/validate_palette.js du skill dataviz,
// mode clair, surface blanche) : luminosité, chroma, séparation daltonisme
// et vision normale OK. L'ambre (#E0A43A) a un contraste < 3:1 -> les % sont
// toujours écrits en texte à côté (légende + tableau), jamais la couleur seule.
const OPTION_COLORS = ["#1F8A6E", "#E0A43A", "#3F6FB0", "#C9542C", "#8B6BC9", "#2A9FB0"];

// Texte écrit DANS un segment : blanc, sauf sur l'ambre (trop clair) -> encre foncée.
const OPTION_TEXT = ["#FFFFFF", "#1C2438", "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF"];

const LEAD_BAR = "#2F6F5E";
const OTHER_BAR = "#A9D2C4";

function formatDate(date: Date) {
  return date.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
}

function fmtPct(n: number) {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} %`;
}

function ParticipationBar({ rate }: { rate: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#EEF0F4]" role="presentation">
      <div className="h-full rounded-full bg-[#2F6F5E]" style={{ width: `${rate}%` }} />
    </div>
  );
}

export function SurveyResultsView({ results, compact = false }: { results: SurveyResults; compact?: boolean }) {
  const questions = compact ? results.questions.slice(0, 2) : results.questions;

  return (
    <div className="space-y-4">
      {/* En-tête + indicateurs clés */}
      <div className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-[family-name:var(--font-display)] text-lg text-[#1C2438]">{results.title}</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  results.isOpen ? "bg-[#E7F3EF] text-[#2F6F5E]" : "bg-[#F3F5F8] text-[#5B6478]"
                }`}
              >
                {results.isOpen ? "Ouvert" : <><Lock className="h-3 w-3" /> Fermé</>}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F1EDFB] px-2 py-0.5 text-[11px] font-medium text-[#5B3E9C]">
                {results.isAnonymous ? <><EyeOff className="h-3 w-3" /> Anonyme</> : <><UserCheck className="h-3 w-3" /> Nominatif</>}
              </span>
            </p>
            {results.description && !compact && (
              <p className="mt-1 text-sm text-[#5B6478]">{results.description}</p>
            )}
            <p className="mt-1 text-xs text-[#9AA1B2]">
              Créé par {results.authorName} le {formatDate(results.createdAt)}
              {results.closesAt && results.isOpen ? ` · clôture le ${formatDate(results.closesAt)}` : ""}
            </p>
          </div>
          {compact && (
            <Link
              href={`/dashboard/surveys/${results.id}`}
              className="group inline-flex items-center gap-1 text-xs font-medium text-[#2F6F5E] hover:underline"
            >
              Analyse complète
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
            </Link>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-[#F7F8FA] p-3">
            <p className="flex items-center gap-1.5 text-xs text-[#5B6478]">
              <Users className="h-3.5 w-3.5" /> Participation
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#1C2438]">{fmtPct(results.participationRate)}</p>
            <div className="mt-2">
              <ParticipationBar rate={results.participationRate} />
            </div>
            <p className="mt-1 text-xs text-[#5B6478]">
              {results.respondents} sur {results.eligible} employés actifs
            </p>
          </div>
          <div className="rounded-lg bg-[#F7F8FA] p-3">
            <p className="flex items-center gap-1.5 text-xs text-[#5B6478]">
              <ListChecks className="h-3.5 w-3.5" /> Questions
            </p>
            <p className="mt-1 text-2xl font-semibold text-[#1C2438]">{results.questions.length}</p>
            <p className="mt-1 text-xs text-[#5B6478]">
              {results.eligible - results.respondents > 0 && results.isOpen
                ? `${results.eligible - results.respondents} employé${results.eligible - results.respondents > 1 ? "s" : ""} n'ont pas encore répondu`
                : "Toutes les réponses sont comptées"}
            </p>
          </div>
          <div className="rounded-lg bg-[#F7F8FA] p-3">
            <p className="flex items-center gap-1.5 text-xs text-[#5B6478]">
              <CalendarClock className="h-3.5 w-3.5" /> Fiabilité
            </p>
            <p className="mt-1 text-sm font-medium text-[#1C2438]">
              {results.respondents < MIN_GROUP_SIZE
                ? "Trop peu de réponses"
                : results.participationRate >= 60
                  ? "Bonne représentativité"
                  : results.participationRate >= 30
                    ? "Représentativité moyenne"
                    : "Faible représentativité"}
            </p>
            <p className="mt-1 text-xs text-[#5B6478]">
              {results.participationRate < 60 && results.isOpen
                ? "Relance les employés (annonce ou message) pour des résultats plus fiables."
                : "Les résultats reflètent l'avis d'une bonne partie des équipes."}
            </p>
          </div>
        </div>
      </div>

      {/* Une carte par question */}
      {questions.map((q, qi) => (
        <div key={q.id} className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9AA1B2]">Question {qi + 1}</p>
          <p className="mt-1 text-base font-medium text-[#1C2438]">{q.text}</p>

          <p className="mt-3 flex items-start gap-2 rounded-lg bg-[#FDF8EC] px-3 py-2 text-sm text-[#5C4A12]">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#8A6A1C]" strokeWidth={1.9} />
            {q.insight}
          </p>

          <ul className="mt-4 space-y-3">
            {q.options.map((o) => {
              const isLead = o.id === q.leadingOptionId;
              return (
                <li key={o.id} title={`${o.label} : ${fmtPct(o.percent)} (${o.count} réponse${o.count > 1 ? "s" : ""})`}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={`min-w-0 truncate ${isLead ? "font-semibold text-[#1C2438]" : "text-[#1C2438]"}`}>
                      {o.label}
                    </span>
                    <span className="shrink-0 tabular-nums text-[#5B6478]">
                      <span className={isLead ? "font-semibold text-[#1C2438]" : "text-[#1C2438]"}>{fmtPct(o.percent)}</span>
                      <span className="ml-1.5 text-xs">({o.count})</span>
                    </span>
                  </div>
                  <div className="mt-1 h-3 w-full rounded-full bg-[#EEF0F4]">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{
                        width: `${o.percent}%`,
                        minWidth: o.count > 0 ? "6px" : 0,
                        backgroundColor: isLead ? LEAD_BAR : OTHER_BAR,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-[#9AA1B2]">
            {q.totalAnswers} réponse{q.totalAnswers > 1 ? "s" : ""}
          </p>

          {!compact && q.departments.length > 0 && (
            <div className="mt-5 border-t border-[#E2E4E9] pt-4">
              <p className="text-sm font-medium text-[#1C2438]">Par département</p>
              {/* Légende : toujours présente, une couleur fixe par choix. */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {q.options.map((o, oi) => (
                  <span key={o.id} className="inline-flex items-center gap-1.5 text-xs text-[#5B6478]">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: OPTION_COLORS[oi % OPTION_COLORS.length] }} />
                    {o.label}
                  </span>
                ))}
              </div>
              <ul className="mt-3 space-y-3">
                {q.departments.map((d) => (
                  <li key={d.departmentId ?? "none"}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium text-[#1C2438]">{d.departmentName}</span>
                      <span className="text-[#9AA1B2]">
                        {d.respondents} répondant{d.respondents > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="mt-1 flex h-5 w-full gap-[2px] overflow-hidden rounded-md bg-[#EEF0F4]">
                      {d.percents.map((p, pi) =>
                        p.percent > 0 ? (
                          <div
                            key={p.optionId}
                            title={`${d.departmentName} — ${q.options[pi].label} : ${fmtPct(p.percent)} (${p.count})`}
                            className="flex h-full items-center justify-center text-[10px] font-semibold"
                            style={{
                              width: `${p.percent}%`,
                              backgroundColor: OPTION_COLORS[pi % OPTION_COLORS.length],
                              color: OPTION_TEXT[pi % OPTION_TEXT.length],
                            }}
                          >
                            {p.percent >= 12 ? `${Math.round(p.percent)} %` : ""}
                          </div>
                        ) : null
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {/* Vue tableau : les mêmes chiffres en texte, lisibles sans couleur. */}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-[#2F6F5E]">Voir en tableau</summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-xs">
                    <thead className="text-[#5B6478]">
                      <tr>
                        <th className="py-1 pr-3 font-medium">Département</th>
                        {q.options.map((o) => (
                          <th key={o.id} className="py-1 pr-3 font-medium">{o.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E4E9] text-[#1C2438]">
                      {q.departments.map((d) => (
                        <tr key={d.departmentId ?? "none"}>
                          <td className="py-1 pr-3">{d.departmentName}</td>
                          {d.percents.map((p) => (
                            <td key={p.optionId} className="py-1 pr-3 tabular-nums">{fmtPct(p.percent)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          )}
          {!compact && q.hiddenDepartments > 0 && (
            <p className="mt-3 text-xs text-[#9AA1B2]">
              {q.hiddenDepartments} département{q.hiddenDepartments > 1 ? "s" : ""} masqué
              {q.hiddenDepartments > 1 ? "s" : ""} (moins de {MIN_GROUP_SIZE} répondants) pour protéger l&apos;anonymat.
            </p>
          )}
        </div>
      ))}

      {compact && results.questions.length > questions.length && (
        <Link
          href={`/dashboard/surveys/${results.id}`}
          className="block text-center text-xs font-medium text-[#2F6F5E] hover:underline"
        >
          + {results.questions.length - questions.length} autre{results.questions.length - questions.length > 1 ? "s" : ""} question
          {results.questions.length - questions.length > 1 ? "s" : ""} dans l&apos;analyse complète
        </Link>
      )}

      {/* Sondage nominatif : qui a répondu quoi (page complète seulement). */}
      {!compact && results.individualResponses && results.individualResponses.length > 0 && (
        <div className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
          <p className="flex items-center gap-2 text-sm font-medium text-[#1C2438]">
            <UserCheck className="h-4 w-4 text-[#5B3E9C]" /> Réponses individuelles
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-[#F7F8FA] text-[#5B6478]">
                <tr>
                  <th className="px-2 py-2 font-medium">Employé</th>
                  <th className="px-2 py-2 font-medium">Département</th>
                  {results.questions.map((q, qi) => (
                    <th key={q.id} className="px-2 py-2 font-medium" title={q.text}>Q{qi + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E4E9] text-[#1C2438]">
                {results.individualResponses.map((r, ri) => (
                  <tr key={ri}>
                    <td className="px-2 py-2 font-medium">{r.name}</td>
                    <td className="px-2 py-2 text-[#5B6478]">{r.department ?? "—"}</td>
                    {results.questions.map((q) => (
                      <td key={q.id} className="px-2 py-2">{r.answers[q.id] ?? "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
