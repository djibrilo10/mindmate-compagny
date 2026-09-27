import { randomInt } from "crypto";

// ------------------------------------------------------------
// Code d'invitation d'organisation — permet à un employé de créer son
// propre compte (auto-inscription) sans que l'admin ait à le créer un par
// un. Voir AUDIT.md 7.18. Différent du modèle `Invitation` (token unique
// par email, jamais branché) : ici, UN SEUL code partagé par organisation,
// régénérable, comme un lien d'invitation Slack.
// ------------------------------------------------------------

// Alphabet sans caractères ambigus (pas de 0/O ni de 1/I/L) pour qu'un
// employé puisse le relire et le retaper sans erreur.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSegment(length: number): string {
  let segment = "";
  for (let i = 0; i < length; i++) {
    segment += ALPHABET[randomInt(ALPHABET.length)];
  }
  return segment;
}

// Génère un code au format "XK7P-2QRT" — exactement le format stocké tel
// quel dans Organization.inviteCode (pas de transformation à la lecture).
export function generateInviteCode(): string {
  return `${randomSegment(4)}-${randomSegment(4)}`;
}

// Normalise ce qu'un employé tape (espaces en trop, minuscules, tiret
// oublié ou mal placé...) vers le même format que celui stocké en base,
// pour que la recherche par égalité (`findUnique`) fonctionne à tous les
// coups. Si le résultat ne fait pas 8 caractères utiles, on renvoie la
// version nettoyée telle quelle : la recherche échouera proprement avec
// "code invalide" plutôt que de planter.
export function normalizeInviteCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 8) return cleaned;
  return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
}
