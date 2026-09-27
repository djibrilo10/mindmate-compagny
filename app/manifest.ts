import type { MetadataRoute } from "next";

// Manifest PWA (Phase 4, voir AUDIT.md 7.17). Next.js sert automatiquement ce
// fichier à /manifest.webmanifest et injecte le <link rel="manifest"> dans le
// <head> -- rien à ajouter manuellement dans app/layout.tsx pour ça.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mindmate Compagny",
    short_name: "Mindmate Compagny",
    description:
      "Portail employé multi-entreprise : signalements, absences, documents, annonces et plus.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F7F8FA",
    theme_color: "#2F6F5E",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
