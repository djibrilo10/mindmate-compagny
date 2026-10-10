// ------------------------------------------------------------
// Génération de CSV pour les exports (Phase 4, voir AUDIT.md 7.16).
// Volontairement écrit à la main (pas de dépendance npm) : le format
// CSV est simple, et ça évite d'ajouter une librairie pour si peu.
// ------------------------------------------------------------

export type CsvColumn = { key: string; label: string };

function escapeCsvField(value: string): string {
  // Anti « injection de formule » (AUDIT.md 7.49) : une cellule qui commence
  // par = + - @ (ou tabulation / retour) serait exécutée comme une formule par
  // Excel. Une apostrophe devant la neutralise (elle n'est pas affichée).
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`;
  }
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(rows: Record<string, string>[], columns: CsvColumn[]): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(row[c.key] ?? "")).join(","));
  // BOM UTF-8 en tête : nécessaire pour qu'Excel affiche correctement les
  // caractères accentués français à l'ouverture du fichier.
  return "﻿" + [header, ...lines].join("\r\n");
}
