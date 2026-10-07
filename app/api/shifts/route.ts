import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";
import { shiftSchema } from "@/lib/validations/schedule";
import { canScheduleUser, findOverlappingShift, parseTime } from "@/lib/schedule";

// ------------------------------------------------------------
// POST /api/shifts (AUDIT.md 7.36) -> ajoute un quart en BROUILLON.
// Réservé à l'admin (toute l'entreprise) et aux responsables (membres de
// leurs départements). L'employé ne le verra qu'après « Publier la semaine ».
// ------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    const body = await request.json().catch(() => null);
    const parsed = shiftSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message ?? "errors.invalidData" }, { status: 400 });
    }
    const { userId, date, start, end, position, note } = parsed.data;

    if (!(await canScheduleUser(ctx, userId))) {
      return Response.json({ error: "schedule.errors.forbidden" }, { status: 403 });
    }

    const startMinute = parseTime(start)!;
    const endMinute = parseTime(end)!;
    const overlap = await findOverlappingShift({ organizationId: ctx.organizationId, userId, date, startMinute, endMinute });
    if (overlap) {
      return Response.json({ error: "schedule.errors.overlap" }, { status: 409 });
    }

    const shift = await prisma.shift.create({
      data: {
        organizationId: ctx.organizationId,
        userId,
        date,
        startMinute,
        endMinute,
        position: position || null,
        note: note || null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });

    return Response.json({ id: shift.id }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error("[shifts:create]", error);
    return Response.json({ error: "errors.serverError" }, { status: 500 });
  }
}
