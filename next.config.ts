import type { NextConfig } from "next";

// ------------------------------------------------------------
// En-têtes de sécurité HTTP sur toutes les pages et routes (AUDIT.md 7.49).
// - CSP : tout vient de notre propre domaine. Next.js a besoin de scripts et
//   styles « inline » (hydratation, Tailwind) d'où 'unsafe-inline' ; en
//   développement, 'unsafe-eval' en plus (rechargement à chaud).
//   Les polices Google sont auto-hébergées par next/font. Stripe s'ouvre dans
//   une nouvelle page (redirection), jamais dans un cadre.
// - frame-ancestors 'none' + X-Frame-Options : l'app ne peut pas être
//   affichée dans le cadre d'un autre site (anti-« clickjacking »).
// - nosniff : le navigateur respecte le type de fichier annoncé.
// ------------------------------------------------------------

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'self' blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // ne pas annoncer « X-Powered-By: Next.js »
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // CSP sur les PAGES seulement : les routes /api qui servent des PDF ont
      // leurs propres en-têtes (une CSP stricte empêche Chrome d'afficher un PDF).
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: csp }] },
    ];
  },
};

export default nextConfig;
