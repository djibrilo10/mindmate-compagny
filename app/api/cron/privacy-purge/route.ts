import { timingSafeEqual } from "node:crypto";
import { purgeExpiredData } from "@/lib/privacy";

// ------------------------------------------------------------
// GET /api/cron/privacy-purge -> suppression automatique Loi 25
// (voir lib/privacy.ts et AUDIT.md 7.28). Appelée chaque nuit par Vercel
// Cron (vercel.json). Pas de session ici : Vercel envoie
// "Authorization: Bearer <CRON_SECRET>". Sans CRON_SECRET configuré, la
// route refuse tout (personne d'autre ne peut déclencher une suppression).
// Cette route n'est PAS dans le matcher du middleware (pas de cookie).
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
    const results = await purgeExpiredData();
    const departures = results.reduce((s, r) => s + r.departuresDeleted, 0);
    const answers = results.reduce((s, r) => s + r.surveyAnswersAnonymized, 0);
    console.log(`[privacy-purge] ${results.length} organisation(s) · ${departures} départ(s) supprimé(s) · ${answers} réponse(s) anonymisée(s)`);
    return Response.json({ ok: true, organizations: results.length, departuresDeleted: departures, surveyAnswersAnonymized: answers });
  } catch (error) {
    console.error("[privacy-purge]", error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
