import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { generateInviteCode } from "@/lib/invite-code";
import { InviteCodeCard } from "@/components/dashboard/InviteCodeCard";
import { LogoUploadCard } from "@/components/dashboard/LogoUploadCard";

const ADMIN_ROLES = ["ORG_ADMIN", "SUPER_ADMIN"];

export default async function SettingsPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  // Page entièrement réservée à l'admin (même pattern que /dashboard/activity,
  // voir AUDIT.md 5.2) : pas de version "allégée" pour MANAGER/EMPLOYEE.
  if (!ADMIN_ROLES.includes(ctx.role)) {
    redirect("/dashboard");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { name: true, inviteCode: true, logoMimeType: true, logoUpdatedAt: true },
  });
  if (!organization) redirect("/dashboard");

  // Génération paresseuse : première visite de cette page pour une
  // organisation créée avant cette fonctionnalité (voir aussi
  // GET /api/organization/invite-code, même logique).
  let inviteCode = organization.inviteCode;
  if (!inviteCode) {
    for (let attempt = 0; attempt < 20 && !inviteCode; attempt++) {
      const candidate = generateInviteCode();
      const clash = await prisma.organization.findUnique({ where: { inviteCode: candidate } });
      if (!clash) inviteCode = candidate;
    }
    if (inviteCode) {
      await prisma.organization.update({
        where: { id: ctx.organizationId },
        data: { inviteCode },
      });
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
          <KeyRound className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Paramètres
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            Personnalise l&apos;espace de {organization.name} et gère l&apos;accès de tes employés.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="animate-fade-in-up stagger-1">
          <LogoUploadCard
            hasCustomLogo={Boolean(organization.logoMimeType)}
            logoVersion={organization.logoUpdatedAt?.getTime() ?? 0}
          />
        </div>

        <div className="animate-fade-in-up stagger-2">
          <InviteCodeCard initialCode={inviteCode ?? ""} />
        </div>
      </div>
    </div>
  );
}
