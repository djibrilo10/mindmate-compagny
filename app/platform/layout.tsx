import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Fraunces, Inter } from "next/font/google";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlatformShell } from "@/components/platform/PlatformShell";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

// ------------------------------------------------------------
// Espace strictement réservé au SUPER_ADMIN (vous) — voir AUDIT.md 7.20.
// N'importe qui d'autre (ORG_ADMIN, MANAGER, EMPLOYEE, même d'une autre
// organisation) est renvoyé vers son propre dashboard, jamais vers /login
// avec un message d'erreur : ça n'a rien d'un problème de connexion.
// ------------------------------------------------------------

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as { id?: string; name?: string | null; email?: string | null; role?: string };

  if (user.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const userLabel = user.name || user.email || "Propriétaire";
  // Badge "Support" : demandes avec un message d'admin pas encore lu (7.24).
  const [supportUnread, unreadNotifications] = await Promise.all([
    prisma.supportTicket.count({ where: { unreadByPlatform: true } }),
    // Cloche du propriétaire (7.25) : SES notifications non lues.
    user.id
      ? prisma.notification.count({ where: { userId: user.id, isRead: false, type: "SUPPORT_MESSAGE" } })
      : 0,
  ]);

  return (
    <div className={`${fraunces.variable} ${inter.variable} font-[family-name:var(--font-body)]`}>
      <PlatformShell userLabel={userLabel} supportUnread={supportUnread} unreadNotifications={unreadNotifications}>{children}</PlatformShell>
    </div>
  );
}
