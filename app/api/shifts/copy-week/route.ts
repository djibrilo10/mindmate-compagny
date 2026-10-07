import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { copyWeekSchema } from "@/lib/validations/schedule";
import { addDays, mondayOf, schedulableUsersWhere, shiftDuration } from "@/lib/schedule";

// ------------------------------------------------------------
// POST /api/shifts/copy-week { fromWeek, toWeek } (AUDIT.md 7.36)
// Recopie les quarts d'une semaine dans une autre, en BROUILLON (rien
// n'est visible pour les employés avant « Publier »). Les quarts qui
// chevaucheraient un quart déjà présent dans la semaine cible sont ignorés.
// C'est ce qui fait gagner le plus de temps : la plupart des horaires se
// répètent d'une semaine à l'autre.
// ------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const usersWhere = schedulableUsersWhere(ctx);
    if (!usersWhere) return Response.json({ error: "schedule.errors.forbidden" }, { status: 403 });

    const parsed = copyWeekSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "errors.invalidData" }, { status: 400 });
    }
    const fromWeek = mondayOf(parsed.data.fromWeek);
    const toWeek = mondayOf(parsed.data.toWeek);
    if (fromWeek === toWeek) return Response.json({ error: "schedule.errors.sameWeek" }, { status: 400 });
    const offsetDays = Math.round((Date.parse(`${toWeek}T00:00:00Z`) - Date.parse(`${fromWeek}T00:00:00Z`)) / 86400000);

    const source = await prisma.shift.findMany({
      where: {
        organizationId: ctx.organizationId,
        date: { gte: fromWeek, lte: addDays(fromWeek, 6) },
        user: usersWhere,
      },
      orderBy: [{ date: "asc" }, { startMinute: "asc" }],
      select: { userId: true, date: true, startMinute: true, endMinute: true, position: true, note: true },
    });

    // Quarts déjà présents autour de la semaine cible (veille incluse, pour
    // les quarts de nuit) : la vérification des chevauchements se fait en
    // mémoire, puis tout est créé en une seule requête.
    const existing = await prisma.shift.findMany({
      where: {
        organizationId: ctx.organizationId,
        userId: { in: Array.from(new Set(source.map((s) => s.userId))) },
        date: { gte: addDays(toWeek, -1), lte: addDays(toWeek, 7) },
      },
      select: { userId: true, date: true, startMinute: true, endMinute: true },
    });
    const origin = Date.parse(`${toWeek}T00:00:00Z`);
    const range = (date: string, start: number, end: number) => {
      const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - origin) / 60000);
      return [offset + start, offset + start + shiftDuration(start, end)] as const;
    };
    const taken = new Map<string, (readonly [number, number])[]>();
    for (const e of existing) {
      taken.set(e.userId, [...(taken.get(e.userId) ?? []), range(e.date, e.startMinute, e.endMinute)]);
    }

    const toCreate: Prisma.ShiftCreateManyInput[] = [];
    let skipped = 0;
    for (const s of source) {
      const date = addDays(s.date, offsetDays);
      const [a0, a1] = range(date, s.startMinute, s.endMinute);
      const busy = taken.get(s.userId) ?? [];
      if (busy.some(([b0, b1]) => a0 < b1 && b0 < a1)) {
        skipped += 1;
        continue;
      }
      busy.push([a0, a1]);
      taken.set(s.userId, busy);
      toCreate.push({
        organizationId: ctx.organizationId,
        userId: s.userId,
        date,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        position: s.position,
        note: s.note,
        createdById: ctx.userId,
      });
    }
    if (toCreate.length > 0) await prisma.shift.createMany({ data: toCreate });
    const copied = toCreate.length;

    if (copied > 0) {
      await prisma.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "SCHEDULE_WEEK_COPIED",
          metadata: { fromWeek, toWeek, count: copied },
        },
      });
    }

    return Response.json({ copied, skipped });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[shifts:copy-week]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
