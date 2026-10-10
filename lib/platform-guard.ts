import { redirect } from "next/navigation";
import { requireAuth, UnauthorizedError, type AuthContext } from "@/lib/session-guard";

// ------------------------------------------------------------
// Garde des pages /platform (AUDIT.md 7.50).
// Le middleware et app/platform/layout.tsx ne lisent que le rôle inscrit dans
// le jeton de session (valable 8 h). Chaque page appelle EN PLUS cette
// fonction, qui relit le compte en base : un compte propriétaire désactivé
// ou dont le mot de passe a été changé perd l'accès immédiatement, même lors
// d'une navigation côté client (où Next.js ne réexécute pas le layout).
// ------------------------------------------------------------

export async function requirePlatformOwner(): Promise<AuthContext> {
  let ctx: AuthContext;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    redirect("/dashboard");
  }
  if (ctx.role !== "SUPER_ADMIN") redirect("/dashboard");
  return ctx;
}
