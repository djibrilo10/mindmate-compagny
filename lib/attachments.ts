// ------------------------------------------------------------
// Règles communes pour les fichiers joints (annonces, et plus tard
// tout autre endroit qui aura besoin de pièces jointes).
// ------------------------------------------------------------

// Vercel limite le corps d'une requête à 4,5 Mo pour une fonction serverless
// Node.js (fixe, non modifiable, sur tous les plans). On vise donc un total
// nettement en dessous pour garder de la marge (en-têtes multipart, etc.).
export const MAX_TOTAL_ATTACHMENTS_SIZE = 3.5 * 1024 * 1024; // 3,5 Mo au total par envoi
export const MAX_ATTACHMENTS_PER_UPLOAD = 5; // par appel à l'API

export const ALLOWED_ATTACHMENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function isAllowedAttachmentType(type: string): boolean {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(type);
}

// Logo d'organisation (voir AUDIT.md 7.19) : un seul petit fichier image,
// règles plus strictes qu'un document/annonce quelconque — pas de PDF, pas
// besoin d'autoriser plusieurs Mo pour un logo.
export const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2 Mo

export const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function isAllowedLogoType(type: string): boolean {
  return (ALLOWED_LOGO_TYPES as readonly string[]).includes(type);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

// ------------------------------------------------------------
// Téléchargement sûr (AUDIT.md 7.49). Le type d'un fichier est annoncé par
// le navigateur au moment de l'envoi : on ne s'y fie pas pour l'afficher.
// On reconnaît le vrai format d'après ses premiers octets ; s'il n'est pas
// un PDF / PNG / JPEG / WEBP, il est servi comme simple téléchargement.
// ------------------------------------------------------------

/** Vrai type d'après les premiers octets (« signature »), sinon null. */
export function detectFileType(bytes: Uint8Array): "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | null {
  const b = (i: number) => bytes[i];
  if (b(0) === 0x25 && b(1) === 0x50 && b(2) === 0x44 && b(3) === 0x46) return "application/pdf"; // %PDF
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) {
    return "image/webp"; // RIFF....WEBP
  }
  return null;
}

/**
 * En-têtes pour servir un fichier stocké en base : affiché dans le navigateur
 * seulement si c'est vraiment un PDF ou une image, sinon téléchargé ; jamais
 * interprété comme une page (nosniff + CSP sandbox).
 */
export function safeFileHeaders(bytes: Uint8Array, fileName: string | null, cacheControl = "private, max-age=3600"): Record<string, string> {
  const real = detectFileType(bytes);
  const encoded = fileName ? encodeURIComponent(fileName) : "";
  const disposition = real ? "inline" : "attachment";
  return {
    "Content-Type": real ?? "application/octet-stream",
    "Content-Length": String(bytes.length),
    ...(fileName ? { "Content-Disposition": `${disposition}; filename="${encoded}"; filename*=UTF-8''${encoded}` } : {}),
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
    // Images : bac à sable strict. PDF : pas de CSP (Chrome refuserait de
    // l'afficher) — le type réel est déjà vérifié ci-dessus.
    ...(real && real !== "application/pdf" ? { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:" } : {}),
  };
}
