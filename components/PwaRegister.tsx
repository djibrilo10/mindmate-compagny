"use client";

import { useEffect } from "react";

// Enregistre le service worker (Phase 4, voir AUDIT.md 7.17). Composant
// client minimal monté une seule fois dans app/layout.tsx (racine, hors du
// groupe (auth) et de dashboard) -- pas d'UI, juste l'effet de bord.
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Échec silencieux : la PWA n'est qu'un bonus, jamais bloquant pour l'app.
    });
  }, []);

  return null;
}
