"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ------------------------------------------------------------
// Affiche une fenêtre (modale) directement dans <body> (AUDIT.md 7.41).
//
// Pourquoi : les pages du tableau de bord sont dans un conteneur animé
// (« animate-fade-in-up ») qui garde un « transform ». Un élément
// « position: fixed » placé dedans se positionne alors par rapport à ce
// conteneur et non à l'écran : sur téléphone, dans une longue page, la
// fenêtre apparaissait hors de l'écran et la page semblait figée.
// Bloque aussi le défilement de la page tant que la fenêtre est ouverte.
// ------------------------------------------------------------

export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return mounted ? createPortal(children, document.body) : null;
}
