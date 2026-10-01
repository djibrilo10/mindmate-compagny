import { redirect } from "next/navigation";
import { BadgeCheck, CalendarPlus, CheckCircle2, Circle, DoorOpen, MapPin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { findCurrentDeparture } from "@/lib/departures";
import { DEPARTURE_TYPE_LABELS } from "@/lib/retention";
import { DepartureSurveyForm } from "@/components/dashboard/DepartureSurveyForm";
import { LocalDateTime } from "@/components/dashboard/LocalDateTime";
import type { HandoverItem } from "@/lib/retention-config";
import { getPrivacyInfo } from "@/lib/privacy";

// ------------------------------------------------------------
// Espace "Mon départ" de l'employé (voir AUDIT.md 7.26) :
// - un admin a enregistré son départ -> il remplit le questionnaire ;
// - sinon -> il peut annoncer lui-même sa démission (+ questionnaire) ;
// - déjà fait -> écran de remerciement.
// ------------------------------------------------------------

function formatDate(date: Date) {
  return date.toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export default async function DeparturePage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  if (ctx.role === "ORG_ADMIN" || ctx.role === "SUPER_ADMIN") redirect("/dashboard/retention");

  const me = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { firstName: true, hireDate: true } });
  const departure = await findCurrentDeparture(ctx.userId, me?.hireDate ?? null);
  // Avis de confidentialité affiché avant le questionnaire (Loi 25, 7.28).
  const privacy = await getPrivacyInfo(ctx.organizationId);

  // Fin d'emploi confirmée / rendez-vous de transition planifié par l'admin
  // principal (7.27) : l'employé voit la date, le lieu, les consignes et ce
  // qu'il doit remettre (lecture seule).
  const items = (Array.isArray(departure?.handoverItems) ? departure?.handoverItems : []) as unknown as HandoverItem[];
  const transition =
    departure && (departure.confirmedAt || departure.transitionAt) ? (
      <section className="mb-4 rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm animate-fade-in-up">
        {departure.confirmedAt && (
          <p className="flex items-center gap-2 text-sm font-medium text-[#2A5A8A]">
            <BadgeCheck className="h-4 w-4" /> Ta fin d&apos;emploi est confirmée par l&apos;administration.
          </p>
        )}
        {departure.transitionAt && (
          <div className={departure.confirmedAt ? "mt-4 border-t border-[#E2E4E9] pt-4" : ""}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9AA1B2]">Rendez-vous de transition</p>
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#1C2438]">
              <CalendarPlus className="h-4 w-4 text-[#2F6F5E]" /> <LocalDateTime iso={departure.transitionAt.toISOString()} />
            </p>
            {departure.transitionLocation && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-[#5B6478]">
                <MapPin className="h-4 w-4" /> {departure.transitionLocation}
              </p>
            )}
            {departure.transitionNotes && <p className="mt-2 whitespace-pre-wrap text-sm text-[#5B6478]">{departure.transitionNotes}</p>}
            {items.length > 0 && (
              <>
                <p className="mt-4 text-sm font-medium text-[#1C2438]">À prévoir pour ce rendez-vous :</p>
                <ul className="mt-2 space-y-1">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 text-sm">
                      {item.done ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2F6F5E]" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-[#B7BECC]" />
                      )}
                      <span className={item.done ? "text-[#5B6478] line-through" : "text-[#1C2438]"}>{item.label}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>
    ) : null;

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF1F5] text-[#5B6478]">
          <DoorOpen className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">Mon départ</h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {departure?.status === "PENDING_SURVEY"
              ? "Ton départ a été enregistré. Il reste le questionnaire (environ 3 minutes)."
              : departure
                ? "Ton départ est enregistré."
                : "Tu as décidé de quitter l'entreprise ? Annonce-le ici et aide-nous à nous améliorer."}
          </p>
        </div>
      </div>

      {transition}

      {departure && departure.status !== "PENDING_SURVEY" ? (
        <div className="animate-fade-in-up flex flex-col items-center gap-3 rounded-xl border border-[#E2E4E9] bg-white px-6 py-12 text-center shadow-sm">
          <CheckCircle2 className="h-8 w-8 text-[#2F6F5E]" />
          <p className="text-base font-medium text-[#1C2438]">Merci {me?.firstName} !</p>
          <p className="max-w-md text-sm text-[#5B6478]">
            {departure.status === "COMPLETED" ? "Ton questionnaire a bien été transmis. " : ""}
            Ton dernier jour est prévu le {formatDate(departure.lastDay)}. Nous te souhaitons une excellente suite.
          </p>
        </div>
      ) : (
        <div className="animate-fade-in-up stagger-1">
          {departure && (
            <p className="mb-4 rounded-lg border border-[#E2E4E9] bg-white px-4 py-3 text-sm text-[#1C2438]">
              {DEPARTURE_TYPE_LABELS[departure.type]} · dernier jour le {formatDate(departure.lastDay)}
            </p>
          )}
          <DepartureSurveyForm askLastDay={!departure} privacy={privacy} />
        </div>
      )}
    </div>
  );
}
