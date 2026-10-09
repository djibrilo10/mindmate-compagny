import { timingSafeEqual } from "node:crypto";
import { sendDueTrialReminders } from "@/lib/trial";

// ------------------------------------------------------------
// GET /api/cron/trial-reminders -> rappels de fin d'essai gratuit
// (AUDIT.md 7.44), appelé chaque matin par Vercel Cron (vercel.json).
// Même protection que /api/cron/privacy-purge : "Authorization: Bearer
// <CRON_SECRET>" ; sans CRON_SECRET, la route refuse tout. Les rappels
// partent aussi à chaque visite de l'espace propriétaire (lib/trial.ts).
// ------------------------------------------------------------

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const sent = await sendDueTrialReminders();
    console.log(`[trial-reminders] ${sent} rappel(s) envoyé(s)`);
    return Response.json({ ok: true, sent });
  } catch (error) {
    console.error("[trial-reminders]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
