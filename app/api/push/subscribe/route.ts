import { prisma } from "@/lib/prisma";
import { requireAuth, handleAuthError } from "@/lib/session-guard";

// ============================================================
// Enregistre/retire l'abonnement notifications push de CET appareil pour
// l'utilisateur connecté. Voir lib/push-client.ts (côté navigateur) et
// lib/push.ts (envoi côté serveur).
// ============================================================

const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Android), Brave…
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, // Safari, iPhone (PWA)
  /(^|\.)notify\.windows\.com$/, // Edge (Windows)
];

function isPushServiceEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

// POST /api/push/subscribe -> enregistre (ou met à jour) l'abonnement
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json();
    const endpoint = body?.endpoint as string | undefined;
    const p256dh = body?.keys?.p256dh as string | undefined;
    const auth = body?.keys?.auth as string | undefined;

    if (!endpoint || !p256dh || !auth) {
      return Response.json({ error: "Abonnement invalide" }, { status: 400 });
    }
    // Anti-SSRF (AUDIT.md 7.49) : le serveur enverra des requêtes à cette
    // adresse ; on n'accepte que les services de notifications des navigateurs.
    if (!isPushServiceEndpoint(endpoint)) {
      return Response.json({ error: "Abonnement invalide" }, { status: 400 });
    }

    // upsert sur "endpoint" : un même appareil ne doit jamais avoir deux
    // lignes (ex. si un autre compte s'était abonné avant sur ce même
    // navigateur, ou si l'utilisateur clique "Activer" deux fois).
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        endpoint,
        p256dh,
        auth,
      },
      update: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        p256dh,
        auth,
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/push/subscribe -> retire l'abonnement de cet appareil
export async function DELETE(request: Request) {
  try {
    const ctx = await requireAuth();

    const body = await request.json();
    const endpoint = body?.endpoint as string | undefined;
    if (!endpoint) {
      return Response.json({ error: "endpoint manquant" }, { status: 400 });
    }

    // Filtré par userId aussi : on ne supprime que SON propre abonnement.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: ctx.userId } });

    return Response.json({ success: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
