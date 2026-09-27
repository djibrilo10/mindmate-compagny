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
