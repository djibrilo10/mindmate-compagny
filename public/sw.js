// Service worker minimal pour l'installabilité PWA (Phase 4, voir AUDIT.md 7.17).
// Volontairement TRÈS limité : ne met en cache QUE la page de secours hors-ligne
// et les icônes. Ne cache JAMAIS /dashboard/*, /api/*, /login, /register -- ce
// sont des pages dynamiques et personnalisées par organisation/utilisateur
// (isolation multi-tenant, voir AUDIT.md 5.1). Les mettre en cache pourrait
// afficher les données d'un compte sur un poste partagé après déconnexion.
// Choix assumé : pas de vraie navigation hors-ligne dans l'app, seulement un
// écran "pas de connexion" propre à la place de l'écran d'erreur du navigateur.

const CACHE_NAME = "pe-shell-v1";
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
