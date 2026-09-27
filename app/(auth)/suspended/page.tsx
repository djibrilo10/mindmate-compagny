import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ShieldAlert } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { SignOutButton } from "@/components/dashboard/SignOutButton";

// ------------------------------------------------------------
// Affichée quand lib/session-guard.ts (ou lib/auth.ts) détecte qu'une
// organisation a été suspendue par le SUPER_ADMIN depuis /platform (voir
// AUDIT.md 7.20), typiquement pour non-paiement. Un employé normal ne peut
// rien faire d'autre ici que se déconnecter — c'est volontaire.
// ------------------------------------------------------------

export default async function SuspendedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Un SUPER_ADMIN n'atterrit jamais ici (voir dashboard/layout.tsx), mais
  // par prudence on ne le laisse pas coincé sur cette page non plus.
  const role = (session.user as { role?: string }).role;
  if (role === "SUPER_ADMIN") redirect("/platform");

  return (
    <div>
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FDECEC] text-[#8A3B3B]">
        <ShieldAlert className="h-6 w-6" strokeWidth={1.9} />
      </span>
      <h1 className="mt-5 font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
        Accès suspendu
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[#5B6478]">
        L&apos;accès de votre organisation à cette application est
        actuellement suspendu. Cela arrive généralement en cas de facturation
        impayée. Contactez votre administrateur pour régulariser la
        situation — l&apos;accès sera rétabli aussitôt.
      </p>
      <div className="mt-8">
        <SignOutButton />
      </div>
    </div>
  );
}
