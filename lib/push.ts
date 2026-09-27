import webpush from "web-push";
import { prisma } from "./prisma";

// ------------------------------------------------------------
// Envoi de vraies notifications système (Web Push API), même quand
// l'app est complètement fermée sur le téléphone/ordinateur — voir
// AUDIT.md pour la mise en place complète (clés VAPID, service worker,
// modèle PushSubscription).
//
// Les clés VAPID identifient CE serveur auprès des services de push des
// navigateurs (Google/Mozilla/Apple) : NEXT_PUBLIC_VAPID_PUBLIC_KEY (utilisée
// aussi côté client, dans lib/push-client.ts) et VAPID_PRIVATE_KEY (jamais
// exposée au client, signe les messages envoyés).
// ------------------------------------------------------------

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails("mailto:djibrilnkeubou@gmail.com", vapidPublicKey, vapidPrivateKey);
}

type PushPayload = {
  title: string;
  body?: string;
  link?: string;
  badgeCount: number; // nombre total de notifications non lues -> affiché sur l'icône de l'app
};

// Envoie une notification push à TOUS les appareils abonnés d'un utilisateur
// (il peut en avoir plusieurs : téléphone + ordinateur, par ex.).
// Ne lève JAMAIS d'erreur : le push est un bonus, jamais une garantie —
// la vraie source de vérité reste la table Notification (voir lib/notifications.ts).
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!vapidPublicKey || !vapidPrivateKey) return; // clés VAPID non configurées -> silencieux

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  const json = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json
        );
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        // 404/410 = l'abonnement n'existe plus côté navigateur (app désinstallée,
        // permission retirée, cache navigateur vidé...) -> on l'oublie pour de bon.
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[push] échec d'envoi", statusCode, error);
        }
      }
    })
  );
}
