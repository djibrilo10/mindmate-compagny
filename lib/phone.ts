// ------------------------------------------------------------
// Numéros de téléphone (connexion par téléphone, AUDIT.md 7.40).
// Sans dépendance serveur : utilisé par les formulaires ET par le serveur.
//
// Stockage au format international « +15145551234 ». Saisie libre acceptée :
// « 514 555-1234 », « (514) 555 1234 », « 1-514-555-1234 », « +33 6 12 34 56 78 ».
// Un numéro à 10 chiffres est considéré nord-américain (+1).
// ------------------------------------------------------------

export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.normalize("NFKC").trim();
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

/** "+15145551234" -> "514-555-1234" ; autres pays : tel quel. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : phone;
}

/** L'identifiant tapé à la connexion est-il un courriel (sinon : un téléphone) ? */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes("@");
}
