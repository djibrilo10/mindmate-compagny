import { decode } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// ------------------------------------------------------------
// Ce middleware tourne AVANT chaque page/route listée dans "matcher".
// Il bloque l'accès à tout ce qui commence par /dashboard ou /api
// (sauf /api/auth) si l'utilisateur n'est pas connecté.
//
// NOTE : ceci protège contre les visiteurs non connectés.
// Ça ne remplace PAS les vérifications de rôle + organizationId
// qui doivent rester dans chaque route (voir lib/session-guard.ts).
// Le middleware = première barrière. session-guard.ts = barrière fine.
//
// POURQUOI PAS withAuth() / getToken() (voir AUDIT.md, journal du 27 sept.
// 2026) : en production sur Vercel (Next.js 16.3.5, next-auth 4.24.15),
// getToken() renvoyait systématiquement null pour un cookie de session
// pourtant valide — confirmé par un test de diagnostic où decode() appelé
// directement sur le MÊME cookie, avec le MÊME secret, réussissait et
// retrouvait bien le rôle de l'utilisateur. Le bug est dans la façon dont
// getToken() lit le cookie depuis la requête dans ce runtime Edge, pas dans
// le secret ni dans le cookie lui-même. On lit donc le cookie nous-mêmes et
// on appelle decode() directement, en contournant getToken().
// ------------------------------------------------------------

const SESSION_COOKIE_NAMES = ["__Secure-next-auth.session-token", "next-auth.session-token"];

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const raw = SESSION_COOKIE_NAMES.map((name) => req.cookies.get(name)?.value).find(Boolean);

  let token: Record<string, any> | null = null;
  if (raw) {
    try {
      token = (await decode({ token: raw, secret: process.env.NEXTAUTH_SECRET ?? "" })) as Record<
        string,
        any
      > | null;
    } catch (err) {
      console.error(
        "[middleware] decode() a échoué pour",
        pathname,
        "-",
        err instanceof Error ? err.message : err
      );
    }
  }

  if (!token) {
    const signInUrl = new URL("/login", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Exemple de garde supplémentaire : empêcher un simple employé
  // d'accéder aux pages qui commencent par /dashboard/admin
  if (pathname.startsWith("/dashboard/admin") && token.role === "EMPLOYEE") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Espace du SUPER_ADMIN (voir AUDIT.md 7.20) : première barrière ici,
  // la vérification fine reste dans app/platform/layout.tsx et
  // lib/session-guard.ts (requireRole côté API).
  if (pathname.startsWith("/platform") && token.role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (pathname.startsWith("/api/platform") && token.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Accès refusé pour ce rôle" }, { status: 403 });
  }

  // Démo publique (AUDIT.md 7.43) : on peut tout regarder, rien modifier.
  // Toute requête d'écriture vers l'API est refusée ici, avant d'atteindre
  // les routes (la déconnexion, /api/auth, n'est pas dans le matcher).
  if (token.isDemo && pathname.startsWith("/api/") && req.method !== "GET" && req.method !== "HEAD") {
    return NextResponse.json({ error: "errors.demoReadOnly" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/api/reports/:path*",
    "/api/absences/:path*",
    "/api/announcements/:path*",
    "/api/files/:path*",
    "/api/jobs/:path*",
    "/api/messages/:path*",
    "/api/reviews/:path*",
    "/api/users/:path*",
    "/api/notifications/:path*",
    "/api/exports/:path*",
    "/api/organization/:path*",
    "/api/push/:path*",
    "/api/admins/:path*",
    "/api/surveys/:path*",
    "/api/support/:path*",
    "/api/departures/:path*",
    "/api/leave/:path*",
    "/api/departments/:path*",
    "/api/me/:path*",
    "/api/shifts/:path*",
    "/api/schedule-files/:path*",
    "/api/shift-swaps/:path*",
    "/api/billing/:path*",
    "/platform/:path*",
    "/api/platform/:path*",
    "/suspended",
  ],
};
