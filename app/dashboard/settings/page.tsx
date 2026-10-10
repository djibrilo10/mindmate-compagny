import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { generateInviteCode } from "@/lib/invite-code";
import { InviteCodeCard } from "@/components/dashboard/InviteCodeCard";
import { LogoUploadCard } from "@/components/dashboard/LogoUploadCard";
import { AdminsCard } from "@/components/dashboard/AdminsCard";
import { SurveyManager } from "@/components/dashboard/SurveyManager";
import { SupportCard } from "@/components/dashboard/SupportCard";
import { PrivacyCard } from "@/components/dashboard/PrivacyCard";
import { LanguageCard } from "@/components/dashboard/LanguageCard";
import { LeaveTypesCard } from "@/components/dashboard/LeaveTypesCard";
import { DepartmentsCard } from "@/components/dashboard/DepartmentsCard";
import { BillingCard, type BillingCardState } from "@/components/dashboard/BillingCard";
import { countBillableEmployees, isInternalOrganization, isPaid } from "@/lib/billing";
import { billingConfigured, stripeRequest } from "@/lib/stripe";
import { VISIBLE_USER } from "@/lib/visibility";
import { getLeaveTypes } from "@/lib/leave";
import { leaveTypeLabel } from "@/lib/leave-format";
import { getI18n } from "@/lib/i18n/server";
import { PLATFORM_BRAND, PLATFORM_CONTACT_NAME } from "@/lib/support";
import { MAX_CO_ADMINS, getPrimaryAdminId } from "@/lib/admins";
import { eligibleRespondentsWhere, isSurveyOpen } from "@/lib/surveys";

const ADMIN_ROLES = ["ORG_ADMIN", "SUPER_ADMIN"];

/** Prix affiché (« 4,00 $ ») lu chez Stripe ; null si indisponible. */
async function stripePriceLabel(locale: string) {
  try {
    const price = await stripeRequest<{ unit_amount: number | null; currency: string }>("GET", `/prices/${process.env.STRIPE_PRICE_ID}`);
    if (price.unit_amount == null) return null;
    return new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA", { style: "currency", currency: price.currency.toUpperCase() }).format(price.unit_amount / 100);
  } catch {
    return null;
  }
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ abonnement?: string }> }) {
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
    select: {
      name: true,
      inviteCode: true,
      logoMimeType: true,
      logoUpdatedAt: true,
      dataRetentionMonths: true,
      privacyOfficerName: true,
      privacyOfficerEmail: true,
      lastPrivacyPurgeAt: true,
      defaultLocale: true,
      leaveYearStartMonth: true,
      isDemo: true,
      plan: true,
      trialEndsAt: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      billingStatus: true,
      billingPeriodEnd: true,
      billingGraceUntil: true,
    },
  });
  if (!organization) redirect("/dashboard");

  // Abonnement (AUDIT.md 7.45) : seulement pour les admins, quand Stripe est
  // configuré, et jamais pour la démo.
  let billing: { state: BillingCardState; daysLeft: number | null; date: string | null; employees: number; priceLabel: string | null } | null = null;
  if (ctx.role === "ORG_ADMIN" && !organization.isDemo && billingConfigured() && !(await isInternalOrganization(ctx.organizationId))) {
    const now = Date.now();
    const status = organization.billingStatus;
    const hasSub = Boolean(organization.stripeSubscriptionId);
    let state: BillingCardState;
    let date: Date | null = null;
    if (hasSub && isPaid(status)) {
      state = status === "trialing" ? "trialing" : "active";
      date = organization.billingPeriodEnd;
    } else if (hasSub && (status === "past_due" || status === "unpaid")) {
      state = "pastDue";
      date = organization.billingGraceUntil;
    } else if (hasSub && status === "canceled") {
      state = "canceled";
      date = organization.billingGraceUntil;
    } else if (organization.trialEndsAt && organization.trialEndsAt.getTime() > now) {
      state = "trial";
      date = organization.trialEndsAt;
    } else if (organization.trialEndsAt) {
      state = "trialEnded";
    } else if (organization.plan === "pro" && !hasSub) {
      state = "manual";
    } else {
      state = "none";
    }
    const daysLeft = organization.trialEndsAt ? Math.max(0, Math.ceil((organization.trialEndsAt.getTime() - now) / 86_400_000)) : null;
    const { locale } = await getI18n();
    const [employees, priceLabel] = await Promise.all([countBillableEmployees(ctx.organizationId), stripePriceLabel(locale)]);
    billing = { state, daysLeft, date: date?.toISOString() ?? null, employees, priceLabel };
  }
  const billingThanks = (await searchParams).abonnement === "merci";

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

  // Équipe d'administration (voir AUDIT.md 7.22) et sondages (7.23).
  const primaryAdminId = await getPrimaryAdminId(ctx.organizationId);
  const isPrimary = primaryAdminId === ctx.userId;
  const [admins, candidates, surveys, eligible] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: ctx.organizationId, role: "ORG_ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, firstName: true, lastName: true, email: true, status: true },
    }),
    // Candidats à la promotion : seulement utile à l'admin principal.
    isPrimary
      ? prisma.user.findMany({
          where: {
            organizationId: ctx.organizationId,
            status: "ACTIVE",
            role: { in: ["EMPLOYEE", "MANAGER"] },
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : Promise.resolve([]),
    prisma.survey.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        isAnonymous: true,
        status: true,
        closesAt: true,
        createdAt: true,
        _count: { select: { questions: true, participations: true } },
      },
    }),
    prisma.user.count({ where: eligibleRespondentsWhere(ctx.organizationId) }),
  ]);

  // Demandes d'assistance (7.24) : admin principal seulement. Les messages
  // du propriétaire sont signés PLATFORM_CONTACT_NAME ; aucune donnée de son
  // compte (id, nom réel, courriel) n'est envoyée au navigateur.
  const supportTickets = isPrimary
    ? await prisma.supportTicket.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { lastMessageAt: "desc" },
        take: 20,
        select: {
          id: true,
          subject: true,
          status: true,
          unreadByAuthor: true,
          lastMessageAt: true,
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              fromPlatform: true,
              content: true,
              createdAt: true,
              sender: { select: { firstName: true, lastName: true } },
            },
          },
        },
      })
    : [];
  const supportRows = supportTickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    unread: t.unreadByAuthor,
    lastMessageAt: t.lastMessageAt.toISOString(),
    messages: t.messages.map((m) => ({
      id: m.id,
      fromPlatform: m.fromPlatform,
      senderName: m.fromPlatform ? PLATFORM_CONTACT_NAME : `${m.sender.firstName} ${m.sender.lastName}`,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  }));

  // Confidentialité (7.28) : nom affiché par défaut = l'admin principal.
  const primaryAdmin = admins.find((a) => a.id === primaryAdminId);
  const defaultOfficerName = primaryAdmin ? `${primaryAdmin.firstName} ${primaryAdmin.lastName}` : "l'admin principal";

  // L'admin principal toujours en tête de liste.
  const adminRows = admins
    .map((a) => ({ ...a, isPrimary: a.id === primaryAdminId }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

  const surveyRows = surveys.map((s) => ({
    id: s.id,
    title: s.title,
    isAnonymous: s.isAnonymous,
    isOpen: isSurveyOpen(s),
    closesAt: s.closesAt ? s.closesAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
    questionCount: s._count.questions,
    respondents: s._count.participations,
  }));

  const { t } = await getI18n();
  // Types de congés (7.30) : admins seulement.
  const leaveTypes = ctx.role === "ORG_ADMIN" ? await getLeaveTypes(ctx.organizationId) : [];
  // Départements et responsables (7.34) : visibles par les admins, modifiables par le principal.
  const [departmentRows, peopleRows] =
    ctx.role === "ORG_ADMIN"
      ? await Promise.all([
          prisma.department.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              color: true,
              _count: { select: { users: { where: { ...VISIBLE_USER, status: "ACTIVE" } } } },
              managers: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
            },
          }),
          isPrimary
            ? prisma.user.findMany({
                where: { organizationId: ctx.organizationId, status: "ACTIVE", role: { in: ["EMPLOYEE", "MANAGER"] } },
                select: { id: true, firstName: true, lastName: true },
                orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
              })
            : Promise.resolve([] as { id: string; firstName: string; lastName: string }[]),
        ])
      : [[], []];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
          <KeyRound className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            {t("settings.title")}
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {t("settings.subtitle", { org: organization.name })}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {billing && (
          <div id="abonnement" className="animate-fade-in-up stagger-1 scroll-mt-20">
            <BillingCard {...billing} hasCustomer={Boolean(organization.stripeCustomerId)} thanks={billingThanks} />
          </div>
        )}

        <div className="animate-fade-in-up stagger-1">
          <LogoUploadCard
            hasCustomLogo={Boolean(organization.logoMimeType)}
            logoVersion={organization.logoUpdatedAt?.getTime() ?? 0}
          />
        </div>

        <div className="animate-fade-in-up stagger-2">
          <InviteCodeCard initialCode={inviteCode ?? ""} />
        </div>

        {ctx.role === "ORG_ADMIN" && (
          <div id="langue" className="animate-fade-in-up stagger-2 scroll-mt-20">
            <LanguageCard initialLocale={organization.defaultLocale === "en" ? "en" : "fr"} />
          </div>
        )}

        {ctx.role === "ORG_ADMIN" && (
          <div className="animate-fade-in-up stagger-3">
            <AdminsCard
              admins={adminRows}
              candidates={candidates}
              isPrimary={isPrimary}
              maxCoAdmins={MAX_CO_ADMINS}
            />
          </div>
        )}

        {ctx.role === "ORG_ADMIN" && (
          <div id="confidentialite" className="animate-fade-in-up stagger-4 scroll-mt-20">
            <PrivacyCard
              isPrimary={isPrimary}
              months={organization.dataRetentionMonths}
              officerName={organization.privacyOfficerName ?? ""}
              officerEmail={organization.privacyOfficerEmail ?? ""}
              defaultOfficerName={defaultOfficerName}
              lastPurgeAt={organization.lastPrivacyPurgeAt?.toISOString() ?? null}
            />
          </div>
        )}

        {ctx.role === "ORG_ADMIN" && (
          <div id="departements" className="animate-fade-in-up stagger-3 scroll-mt-20">
            <DepartmentsCard
              isPrimary={isPrimary}
              departments={departmentRows.map((d) => ({
                id: d.id,
                name: d.name,
                color: d.color,
                memberCount: d._count.users,
                managers: d.managers.map((m) => ({ id: m.user.id, name: `${m.user.firstName} ${m.user.lastName}` })),
              }))}
              people={peopleRows.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }))}
            />
          </div>
        )}

        {ctx.role === "ORG_ADMIN" && (
          <div id="conges" className="animate-fade-in-up stagger-4 scroll-mt-20">
            <LeaveTypesCard
              yearStartMonth={organization.leaveYearStartMonth}
              types={leaveTypes.map((type) => ({
                id: type.id,
                defaultLabel: type.code ? leaveTypeLabel(t, { code: type.code, name: null }) : null,
                name: type.name ?? "",
                daysPerYear: type.daysPerYear,
                color: type.color,
                isActive: type.isActive,
              }))}
            />
          </div>
        )}

        {isPrimary && (
          <div id="support" className="animate-fade-in-up stagger-5 scroll-mt-20">
            <SupportCard tickets={supportRows} contactName={PLATFORM_CONTACT_NAME} brand={PLATFORM_BRAND} />
          </div>
        )}

        {ctx.role === "ORG_ADMIN" && (
          <div id="sondages" className="animate-fade-in-up stagger-4 scroll-mt-20">
            <SurveyManager surveys={surveyRows} eligible={eligible} />
          </div>
        )}
      </div>
    </div>
  );
}
