import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Fraunces, Inter } from "next/font/google";
import type { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);

  // Le middleware de la Phase 1 bloque déjà l'accès sans session, mais on
  // revérifie ici au niveau du layout : jamais confiance uniquement au
  // frontend, même quand une autre couche fait déjà la vérification.
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as {
    id?: string;
    name?: string | null;
    email?: string | null;
    organizationId?: string;
    role?: Role;
  };

  // Le SUPER_ADMIN (vous) a son propre espace, séparé du dashboard des
  // entreprises clientes — voir AUDIT.md 7.20. Il n'a rien à faire ici.
  if (user.role === "SUPER_ADMIN") {
    redirect("/platform");
  }

  const [organization, unreadNotifications, dbUser] = await Promise.all([
    user.organizationId
      ? prisma.organization.findUnique({
          where: { id: user.organizationId },
          select: { name: true, status: true },
        })
      : null,
    user.id
      ? prisma.notification.count({ where: { userId: user.id, isRead: false } })
      : 0,
    user.id
      ? prisma.user.findUnique({ where: { id: user.id }, select: { role: true, status: true } })
      : null,
  ]);

  // Compte désactivé depuis la connexion (ex. co-admin désactivé par l'admin
  // principal, voir AUDIT.md 7.22) : accès coupé tout de suite, comme dans
  // lib/session-guard.ts.
  if (!dbUser || dbUser.status !== "ACTIVE") {
    redirect("/login");
  }

  // Organisation suspendue par le SUPER_ADMIN (non-paiement, etc.) : on
  // coupe l'accès ici plutôt que d'attendre l'expiration du token JWT
  // (8h) — voir aussi la même vérification côté API dans session-guard.ts.
  if (organization?.status === "SUSPENDED") {
    redirect("/suspended");
  }

  const userLabel = user.name || user.email || "Mon compte";
  const organizationName = organization?.name || "Votre organisation";
  // Rôle lu en base (pas dans le token) : un employé promu co-admin voit
  // tout de suite les menus admin, un co-admin retiré les perd tout de suite.
  const role = dbUser.role;

  return (
    <div className={`${fraunces.variable} ${inter.variable} font-[family-name:var(--font-body)]`}>
      <DashboardShell
        organizationName={organizationName}
        userLabel={userLabel}
        role={role}
        unreadNotifications={unreadNotifications}
      >
        {children}
      </DashboardShell>
    </div>
  );
}
