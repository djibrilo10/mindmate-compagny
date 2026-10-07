// Formats et taille des horaires téléversés (AUDIT.md 7.39). Sans dépendance
// serveur : importable dans les composants client.

export const MAX_SCHEDULE_FILE_SIZE = 3.5 * 1024 * 1024; // 3,5 Mo

/** Extensions acceptées -> type MIME de référence. */
const TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/** Pour l'attribut accept="..." du champ fichier. */
export const SCHEDULE_FILE_ACCEPT = Object.keys(TYPES_BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(",");

/**
 * Type MIME fiable d'un fichier reçu, déduit de son EXTENSION (le type
 * envoyé par le navigateur est parfois vide ou faux sous Windows, ex. un
 * .csv annoncé comme Excel). null = format refusé.
 */
export function scheduleFileMimeType(fileName: string): string | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return TYPES_BY_EXTENSION[ext] ?? null;
}

/** Les navigateurs savent afficher ces formats ; les autres sont téléchargés. */
export function isPreviewable(mimeType: string) {
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}
