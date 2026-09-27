import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Fraunces, Inter } from "next/font/google";
import { authOptions } from "@/lib/auth";
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

  const user = session.user as { name?: string | null; email?: string | null; role?: string };

  if (user.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }

  const userLabel = user.name || user.email || "Propriétaire";

  return (
    <div className={`${fraunces.variable} ${inter.variable} font-[family-name:var(--font-body)]`}>
      <PlatformShell userLabel={userLabel}>{children}</PlatformShell>
    </div>
  );
}
