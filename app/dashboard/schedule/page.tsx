import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarHeart, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { getI18n } from "@/lib/i18n/server";
import {
  addDays,
  formatMinutes,
  isDateString,
  mondayOf,
  schedulableUsersWhere,
  shiftDuration,
  todayInZone,
  weekDates,
} from "@/lib/schedule";
import { ScheduleBoard, type BoardShift } from "@/components/dashboard/ScheduleBoard";

// ------------------------------------------------------------
// Horaires (AUDIT.md 7.36), une semaine à la fois (lundi -> dimanche) :
// - admin / responsable : grille personnes x jours, brouillons + publiés,
//   ajout/modification de quarts, « Copier la semaine précédente »,
//   « Publier la semaine » ;
// - employé : SES quarts PUBLIÉS de la semaine, jour par jour.
// Les congés approuvés sont affichés dans les deux vues.
// ------------------------------------------------------------

/** Dates (AAAA-MM-JJ) de la semaine couvertes par un congé approuvé, par personne. */
async function approvedAbsenceDays(userIds: string[], week: string) {
  const days = weekDates(week);
  const result: Record<string, string[]> = {};
  if (userIds.length === 0) return result;
  const absences = await prisma.absenceRequest.findMany({
    where: {
      userId: { in: userIds },
      status: "APPROVED",
      startDate: { lte: new Date(`${addDays(week, 6)}T23:59:59Z`) },
      endDate: { gte: new Date(`${week}T00:00:00Z`) },
    },
    select: { userId: true, startDate: true, endDate: true },
  });
  for (const a of absences) {
    const from = a.startDate.toISOString().slice(0, 10);
    const to = a.endDate.toISOString().slice(0, 10);
    for (const d of days) {
      if (d >= from && d <= to) result[a.userId] = Array.from(new Set([...(result[a.userId] ?? []), d]));
    }
  }
  return result;
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string | string[] }> }) {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
  const { t, formatDate } = await getI18n();

  const today = todayInZone();
  const requested = (await searchParams).week;
  const week = mondayOf(typeof requested === "string" && isDateString(requested) ? requested : today);
  const days = weekDates(week);
  const usersWhere = schedulableUsersWhere(ctx);
  const weekLabel = t("schedule.weekOf", { date: formatDate(`${week}T12:00:00Z`, { month: "long", day: "numeric", year: "numeric" }) });

  const header = (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
          <Clock3 className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">{t("schedule.title")}</h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">{usersWhere ? t("schedule.subtitleManage") : t("schedule.subtitleMine")}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Link
          href={`/dashboard/schedule?week=${addDays(week, -7)}`}
          aria-label={t("schedule.previousWeek")}
          className="rounded-lg border border-[#E2E4E9] bg-white p-2 text-[#1C2438] hover:bg-[#F7F8FA]"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-[11rem] text-center text-sm font-medium text-[#1C2438]">{weekLabel}</span>
        <Link
          href={`/dashboard/schedule?week=${addDays(week, 7)}`}
          aria-label={t("schedule.nextWeek")}
          className="rounded-lg border border-[#E2E4E9] bg-white p-2 text-[#1C2438] hover:bg-[#F7F8FA]"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
        {week !== mondayOf(today) && (
          <Link href="/dashboard/schedule" className="ml-1 rounded-lg border border-[#E2E4E9] bg-white px-3 py-2 text-xs font-medium text-[#2F6F5E] hover:bg-[#F7F8FA]">
            {t("schedule.thisWeek")}
          </Link>
        )}
      </div>
    </div>
  );

  // ---------- Vue gérant : grille de la semaine ----------
  if (usersWhere) {
    const employees = await prisma.user.findMany({
      where: usersWhere,
      select: { id: true, firstName: true, lastName: true, department: { select: { id: true, name: true, color: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const ids = employees.map((e) => e.id);
    const [shifts, absences] = await Promise.all([
      prisma.shift.findMany({
        where: { organizationId: ctx.organizationId, userId: { in: ids }, date: { gte: week, lte: addDays(week, 6) } },
        orderBy: [{ date: "asc" }, { startMinute: "asc" }],
        select: { id: true, userId: true, date: true, startMinute: true, endMinute: true, position: true, note: true, publishedAt: true },
      }),
      approvedAbsenceDays(ids, week),
    ]);

    const boardShifts: BoardShift[] = shifts.map((s) => ({
      id: s.id,
      userId: s.userId,
      date: s.date,
      start: formatMinutes(s.startMinute),
      end: formatMinutes(s.endMinute),
      minutes: shiftDuration(s.startMinute, s.endMinute),
      position: s.position ?? "",
      note: s.note ?? "",
      published: Boolean(s.publishedAt),
    }));

    return (
      <div>
        {header}
        <div className="animate-fade-in-up stagger-1">
          <ScheduleBoard
            week={week}
            days={days}
            today={today}
            employees={employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`, department: e.department }))}
            shifts={boardShifts}
            absences={absences}
          />
        </div>
      </div>
    );
  }

  // ---------- Vue employé : mes quarts publiés ----------
  const [myShifts, myAbsences] = await Promise.all([
    prisma.shift.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        publishedAt: { not: null },
        date: { gte: week, lte: addDays(week, 6) },
      },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
      select: { id: true, date: true, startMinute: true, endMinute: true, position: true, note: true },
    }),
    approvedAbsenceDays([ctx.userId], week),
  ]);
  const totalMinutes = myShifts.reduce((sum, s) => sum + shiftDuration(s.startMinute, s.endMinute), 0);
  const offDays = new Set(myAbsences[ctx.userId] ?? []);

  return (
    <div>
      {header}
      <p className="mb-4 text-sm text-[#5B6478] animate-fade-in-up stagger-1">
        {t("schedule.myTotal", { hours: (totalMinutes / 60).toLocaleString(undefined, { maximumFractionDigits: 2 }) })}
      </p>
      <div className="grid gap-2.5 animate-fade-in-up stagger-1 sm:grid-cols-2 lg:grid-cols-4">
        {days.map((day) => {
          const dayShifts = myShifts.filter((s) => s.date === day);
          const isToday = day === today;
          return (
            <div
              key={day}
              className={`rounded-xl border bg-white p-3.5 shadow-sm ${isToday ? "border-[#2F6F5E] ring-2 ring-[#2F6F5E]/15" : "border-[#E2E4E9]"}`}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-[#5B6478]">
                {formatDate(`${day}T12:00:00Z`, { weekday: "long", day: "numeric", month: "short" })}
                {isToday && <span className="ml-1.5 rounded-full bg-[#E7F3EF] px-1.5 py-0.5 text-[10px] text-[#2F6F5E]">{t("schedule.today")}</span>}
              </p>
              <div className="mt-2 space-y-1.5">
                {offDays.has(day) && (
                  <p className="inline-flex items-center gap-1 rounded-md bg-[#FFF4E0] px-2 py-1 text-xs font-medium text-[#8A5A12]">
                    <CalendarHeart className="h-3.5 w-3.5" /> {t("schedule.onLeave")}
                  </p>
                )}
                {dayShifts.length === 0 && !offDays.has(day) && <p className="text-sm text-[#9AA1B2]">{t("schedule.dayOff")}</p>}
                {dayShifts.map((s) => (
                  <div key={s.id} className="rounded-lg bg-[#F3F9F7] px-2.5 py-2">
                    <p className="flex items-center gap-1.5 text-base font-semibold text-[#1C2438]">
                      <Clock3 className="h-4 w-4 text-[#2F6F5E]" />
                      {formatMinutes(s.startMinute)} – {formatMinutes(s.endMinute)}
                      {s.endMinute <= s.startMinute && <span className="text-xs font-normal text-[#5B6478]">{t("schedule.nextDay")}</span>}
                    </p>
                    {s.position && <p className="mt-0.5 text-sm text-[#2F6F5E]">{s.position}</p>}
                    {s.note && <p className="mt-0.5 text-xs text-[#5B6478]">{s.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
