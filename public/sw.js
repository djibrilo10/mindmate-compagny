// Service worker minimal pour l'installabilité PWA (Phase 4, voir AUDIT.md 7.17).
// Volontairement TRÈS limité : ne met en cache QUE la page de secours hors-ligne
// et les icônes. Ne cache JAMAIS /dashboard/*, /api/*, /login, /register -- ce
// sont des pages dynamiques et personnalisées par organisation/utilisateur
// (isolation multi-tenant, voir AUDIT.md 5.1). Les mettre en cache pourrait
// afficher les données d'un compte sur un poste partagé après déconnexion.
// Choix assumé : pas de vraie navigation hors-ligne dans l'app, seulement un
// écran "pas de connexion" propre à la place de l'écran d'erreur du navigateur.

const CACHE_NAME = "pe-shell-v2"; // v2 : nouveau logo « Équipe » (3 oct. 2026), force le rafraîchissement des icônes en cache
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Seules les navigations (chargement d'une page) passent par un fallback
  // hors-ligne. Tout le reste (API, données, assets Next.js/Turbopack) suit le
  // comportement réseau normal du navigateur, sans interception : on ne met
  // JAMAIS en cache quelque chose de spécifique à un utilisateur/organisation.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});

// ------------------------------------------------------------
// Notifications push (voir AUDIT.md) : reçoit le message envoyé par
// lib/push.ts (via le service de push du navigateur), affiche une vraie
// notification système, ET met à jour le badge numérique sur l'icône de
// l'app (Badging API) -- fonctionne même si l'app est complètement fermée,
// c'est tout l'intérêt par rapport au badge "en app" du Topbar/NotificationsList.
// Le son joué à la réception est celui, par défaut, du système d'exploitation
// pour une notification -- le Web n'offre pas de moyen fiable/multi-navigateur
// d'imposer un fichier son personnalisé pour une notification système.
// ------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Mindmate Compagny";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { link: data.link || "/dashboard/notifications" },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);

      if (typeof data.badgeCount === "number" && "setAppBadge" in self.navigator) {
        try {
          if (data.badgeCount > 0) {
            await self.navigator.setAppBadge(data.badgeCount);
          } else {
            await self.navigator.clearAppBadge();
          }
        } catch {
          // Badging API non supportée par ce navigateur -- pas grave, la
          // notification système elle-même s'est quand même affichée.
        }
      }
    })()
  );
});

// Clic sur la notification système -> ramène au premier plan un onglet déjà
// ouvert sur l'app si possible, sinon en ouvre un nouveau sur le lien fourni.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/dashboard/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});
