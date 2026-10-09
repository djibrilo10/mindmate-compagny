import { z } from "zod";
import { isDateString, parseTime, shiftDuration, MAX_SHIFT_MINUTES, MIN_SHIFT_MINUTES } from "@/lib/schedule-time";

// Horaires (AUDIT.md 7.36). Messages = clés de traduction.

const time = z.string().refine((v) => parseTime(v) !== null, "schedule.errors.timeInvalid");

export const shiftSchema = z
  .object({
    userId: z.string().min(1, "schedule.errors.employeeRequired"),
    date: z.string().refine(isDateString, "schedule.errors.dateInvalid"),
    start: time,
    end: time,
    position: z.string().trim().max(60, "schedule.errors.positionTooLong").default(""),
    note: z.string().trim().max(300, "schedule.errors.noteTooLong").default(""),
  })
  .refine(
    (v) => {
      const s = parseTime(v.start);
      const e = parseTime(v.end);
      if (s === null || e === null || s === e) return false;
      const d = shiftDuration(s, e);
      return d >= MIN_SHIFT_MINUTES && d <= MAX_SHIFT_MINUTES;
    },
    { message: "schedule.errors.durationInvalid", path: ["end"] }
  );

export const weekSchema = z.object({
  week: z.string().refine(isDateString, "schedule.errors.dateInvalid"),
});

// Publication (AUDIT.md 7.37) : département ciblé ("" = tous, "__none__" =
// personnes sans département) et visibilité choisie par le gérant.
export const publishSchema = z.object({
  week: z.string().refine(isDateString, "schedule.errors.dateInvalid"),
  departmentId: z.string().default(""),
  teamVisible: z.boolean().default(false),
});

export const copyWeekSchema = z.object({
  fromWeek: z.string().refine(isDateString, "schedule.errors.dateInvalid"),
  toWeek: z.string().refine(isDateString, "schedule.errors.dateInvalid"),
});

// Échanges de quart (AUDIT.md 7.42). targetUserId "" = tout son département.
export const swapCreateSchema = z.object({
  shiftId: z.string().min(1, "schedule.swap.errors.notFound"),
  targetUserId: z.string().default(""),
  note: z.string().trim().max(300, "schedule.errors.noteTooLong").default(""),
});

export const swapActionSchema = z.object({
  action: z.enum(["accept", "decline", "cancel", "approve", "reject"]),
});

export type ShiftInput = z.infer<typeof shiftSchema>;
