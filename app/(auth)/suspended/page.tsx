import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ShieldAlert } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { BillingButton } from "@/components/dashboard/BillingButton";
import { getI18n } from "@/lib/i18n/server";
import { billingConfigured } from "@/lib/stripe";

// ------------------------------------------------------------
// Affichée quand lib/session-guard.ts (ou lib/auth.ts) détecte qu'une
// organisation a été suspendue par le SUPER_ADMIN depuis /platform (voir
// AUDIT.md 7.20), ou automatiquement pour non-paiement (7.45).
// - Suspension pour non-paiement + admin : bouton pour payer, l'accès
//   revient aussitôt (webhook Stripe -> lib/billing.ts).
// - Sinon : un employé ne peut rien faire d'autre que se déconnecter.
// ------------------------------------------------------------

export default async function SuspendedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  // Un SUPER_ADMIN n'atterrit jamais ici (voir dashboard/layout.tsx), mais
  // par prudence on ne le laisse pas coincé sur cette page non plus.
  const sessionUser = session.user as { id?: string; role?: string; organizationId?: string };
  if (sessionUser.role === "SUPER_ADMIN") redirect("/platform");
  const { t } = await getI18n();

  const [user, organization] = await Promise.all([
    sessionUser.id ? prisma.user.findUnique({ where: { id: sessionUser.id }, select: { role: true } }) : null,
    sessionUser.organizationId
      ? prisma.organization.findUnique({
          where: { id: sessionUser.organizationId },
          select: { status: true, suspendedReason: true, stripeCustomerId: true, billingStatus: true },
        })
      : null,
  ]);
  if (organization && organization.status !== "SUSPENDED") redirect("/dashboard");

  const canPay =
    user?.role === "ORG_ADMIN" && organization?.suspendedReason === "billing" && billingConfigured();
  const fixCard = Boolean(organization?.stripeCustomerId) && ["past_due", "unpaid"].includes(organization?.billingStatus ?? "");

  return (
    <div>
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FDECEC] text-[#8A3B3B]">
        <ShieldAlert className="h-6 w-6" strokeWidth={1.9} />
      </span>
      <h1 className="mt-5 font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
        {canPay ? t("billing.suspended.title") : t("auth.suspended.title")}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[#5B6478]">
        {canPay ? t("billing.suspended.body") : t("auth.suspended.body")}
      </p>
      {canPay && (
        <div className="mt-6">
          <BillingButton mode={fixCard ? "portal" : "checkout"} label={fixCard ? t("billing.banner.fix") : t("billing.banner.pay")} />
        </div>
      )}
      <div className="mt-8">
        <SignOutButton />
      </div>
    </div>
  );
}
