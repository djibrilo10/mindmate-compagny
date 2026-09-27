import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// ------------------------------------------------------------
// Ce middleware tourne AVANT chaque page/route listée dans "matcher".
// Il bloque l'accès à tout ce qui commence par /dashboard ou /api
// (sauf /api/auth) si l'utilisateur n'est pas connecté.
//
// NOTE : ceci protège contre les visiteurs non connectés.
// Ça ne remplace PAS les vérifications de rôle + organizationId
// qui doivent rester dans chaque route (voir lib/session-guard.ts).
// Le middleware = première barrière. session-guard.ts = barrière fine.
// ------------------------------------------------------------

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    // Exemple de garde supplémentaire : empêcher un simple employé
    // d'accéder aux pages qui commencent par /dashboard/admin
    if (pathname.startsWith("/dashboard/admin") && token?.role === "EMPLOYEE") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token, // true = laisse passer, false = redirige vers /login
    },
  }
);

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
  ],
};
