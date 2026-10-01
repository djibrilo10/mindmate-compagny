import { prisma } from "@/lib/prisma";

// Outils partagés par les routes /api/departures (voir AUDIT.md 7.26).

/** "2026-10-15" -> Date à midi UTC (évite les décalages de fuseau d'un jour). */
export function parseLastDay(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const oneYear = 365 * 24 * 3600 * 1000;
  if (Math.abs(date.getTime() - Date.now()) > oneYear) return null; // garde-fou : ± 1 an
  return date;
}

/**
 * Départ "en cours" de l'employé : un départ enregistré DEPUIS sa date
 * d'embauche (s'il a été réembauché après un ancien départ, l'ancien ne
 * compte plus).
 */
export async function findCurrentDeparture(userId: string, hireDate: Date | null) {
  return prisma.departure.findFirst({
    where: { userId, ...(hireDate ? { createdAt: { gte: hireDate } } : {}) },
    orderBy: { createdAt: "desc" },
  });
}
