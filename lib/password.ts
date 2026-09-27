import bcrypt from "bcryptjs";

// 12 rounds = bon équilibre sécurité/performance en 2026.
// Ne JAMAIS descendre en dessous de 10, ne JAMAIS stocker un mot de passe en clair.
const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(
  plainPassword: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, hashedPassword);
}

// Règle minimale de robustesse — à utiliser côté inscription/changement de mdp.
// Complète (mais ne remplace pas) la validation frontend.
export function isPasswordStrongEnough(password: string): boolean {
  const minLength = 10;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return password.length >= minLength && hasUpper && hasLower && hasNumber;
}
