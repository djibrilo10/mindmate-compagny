import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { Fraunces, Inter } from "next/font/google";
import {
  ArrowRightLeft,
  BarChart3,
  BellRing,
  CalendarHeart,
  Check,
  Clock3,
  DoorOpen,
  Flag,
  Languages,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { DemoButtons } from "@/components/landing/DemoButtons";
import { DemoRequestForm } from "@/components/landing/DemoRequestForm";

// ------------------------------------------------------------
// Page d'accueil PUBLIQUE (AUDIT.md 7.43) — remplace l'ancienne redirection
// vers /dashboard. But : présenter Mindmate aux PME, leur faire explorer la
// démo (entreprise fictive, lecture seule) et recueillir des demandes de
// démo. FR/EN avec le même bouton que l'app. L'app installée (PWA) ouvre
// directement /dashboard (app/manifest.ts), elle ne passe pas par ici.
// ------------------------------------------------------------

const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("landing.metaTitle"), description: t("landing.metaDescription") };
}

export default async function HomePage() {
  const { t } = await getI18n();
  const session = await getServerSession(authOptions).catch(() => null);
  const loggedIn = Boolean(session?.user) && !(session?.user as { isDemo?: boolean } | undefined)?.isDemo;

  const features: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: Clock3, title: t("landing.features.scheduleTitle"), body: t("landing.features.scheduleBody") },
    { icon: ArrowRightLeft, title: t("landing.features.swapsTitle"), body: t("landing.features.swapsBody") },
    { icon: CalendarHeart, title: t("landing.features.absencesTitle"), body: t("landing.features.absencesBody") },
    { icon: Megaphone, title: t("landing.features.announcementsTitle"), body: t("landing.features.announcementsBody") },
    { icon: MessageSquare, title: t("landing.features.messagesTitle"), body: t("landing.features.messagesBody") },
    { icon: Flag, title: t("landing.features.reportsTitle"), body: t("landing.features.reportsBody") },
    { icon: DoorOpen, title: t("landing.features.departuresTitle"), body: t("landing.features.departuresBody") },
    { icon: BarChart3, title: t("landing.features.surveysTitle"), body: t("landing.features.surveysBody") },
  ];
  const steps = [
    { title: t("landing.steps.one"), body: t("landing.steps.oneBody") },
    { title: t("landing.steps.two"), body: t("landing.steps.twoBody") },
    { title: t("landing.steps.three"), body: t("landing.steps.threeBody") },
  ];
  const trust: { icon: LucideIcon; text: string }[] = [
    { icon: Languages, text: t("landing.trust.languages") },
    { icon: Smartphone, text: t("landing.trust.phone") },
    { icon: ShieldCheck, text: t("landing.trust.private") },
    { icon: BellRing, text: t("landing.trust.notifications") },
  ];

  return (
    <div className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#F7F8FA] font-[family-name:var(--font-body)] text-[#1C2438]`}>
      {/* ---------- En-tête ---------- */}
      <header className="sticky top-0 z-20 border-b border-[#E2E4E9]/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark-black.png" alt="" aria-hidden className="h-8 w-8 shrink-0 object-contain" />
            <span className="hidden font-[family-name:var(--font-display)] text-lg tracking-tight sm:inline">Mindmate Compagny</span>
          </Link>
          <nav className="ml-6 hidden items-center gap-5 text-sm text-[#5B6478] md:flex">
            <a href="#fonctionnalites" className="hover:text-[#1C2438]">{t("landing.nav.features")}</a>
            <a href="#comment" className="hover:text-[#1C2438]">{t("landing.nav.howItWorks")}</a>
            <a href="#demander-une-demo" className="hover:text-[#1C2438]">{t("landing.nav.requestDemo")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              href={loggedIn ? "/dashboard" : "/login"}
              className="whitespace-nowrap rounded-lg bg-[#1C2438] px-3 py-2 text-sm font-medium text-white hover:bg-[#2A3550]"
            >
              {loggedIn ? t("landing.nav.openSpace") : t("landing.nav.signIn")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ---------- Accroche + démo ---------- */}
        <section className="relative overflow-hidden bg-[radial-gradient(ellipse_at_top_left,_#FFFFFF_0%,_#EEF4F2_55%,_#F7F8FA_100%)]">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 md:py-20 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="animate-fade-in-up">
              <p className="inline-flex rounded-full bg-[#E7F3EF] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#2F6F5E]">
                {t("landing.hero.eyebrow")}
              </p>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-5xl">{t("landing.hero.title")}</h1>
              <p className="mt-4 max-w-xl text-lg text-[#5B6478]">{t("landing.hero.subtitle")}</p>

              <div id="demo" className="mt-8 max-w-xl scroll-mt-24">
                <p className="text-sm font-semibold text-[#1C2438]">{t("landing.demoPicker.title")}</p>
                <p className="mb-3 mt-0.5 text-sm text-[#5B6478]">{t("landing.demoPicker.help")}</p>
                {loggedIn ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-2 rounded-xl bg-[#2F6F5E] px-5 py-3 text-base font-semibold text-white hover:bg-[#275D4F]"
                  >
                    {t("landing.nav.openSpace")}
                  </Link>
                ) : (
                  <DemoButtons />
                )}
                <p className="mt-4 text-sm text-[#5B6478]">
                  <a href="#demander-une-demo" className="font-semibold text-[#2F6F5E] underline underline-offset-4">
                    {t("landing.hero.requestDemo")}
                  </a>{" "}
                  · {t("landing.hero.note")}
                </p>
              </div>
            </div>

            {/* Aperçu de téléphone, dessiné en CSS (pas une capture d'écran) */}
            <div className="mx-auto w-full max-w-[300px] animate-scale-in" aria-hidden>
              <div className="rounded-[2.5rem] border-[10px] border-[#1C2438] bg-[#F7F8FA] p-3 shadow-2xl">
                <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-[#1C2438]/80" />
                <div className="rounded-2xl border border-[#2F6F5E] bg-white p-3 ring-2 ring-[#2F6F5E]/15">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#5B6478]">{t("landing.mock.today")}</p>
                  <p className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-[#F3F9F7] px-2 py-2 text-sm font-semibold">
                    <Clock3 className="h-4 w-4 text-[#2F6F5E]" /> {t("landing.mock.shift")}
                  </p>
                </div>
                <div className="mt-2.5 rounded-2xl border border-[#2F6F5E]/30 bg-[#F6FBF9] p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <ArrowRightLeft className="h-4 w-4 text-[#2F6F5E]" /> {t("landing.mock.swapTitle")}
                  </p>
                  <p className="mt-0.5 text-xs text-[#5B6478]">{t("landing.mock.swapBody")}</p>
                  <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-[#2F6F5E] px-2.5 py-1.5 text-xs font-semibold text-white">
                    <Check className="h-3.5 w-3.5" /> {t("landing.mock.take")}
                  </p>
                </div>
                <div className="mt-2.5 rounded-2xl border border-[#E2E4E9] bg-white p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <Megaphone className="h-4 w-4 text-[#E0A43A]" /> {t("landing.mock.announcement")}
                  </p>
                  <p className="mt-0.5 text-xs text-[#5B6478]">{t("landing.mock.announcementBody")}</p>
                </div>
                <div className="mt-2.5 grid grid-cols-4 gap-1.5 px-1 pb-1">
                  {[Clock3, CalendarHeart, Megaphone, MessageSquare].map((Icon, i) => (
                    <span key={i} className={`flex h-9 items-center justify-center rounded-xl ${i === 0 ? "bg-[#2F6F5E] text-white" : "bg-white text-[#5B6478]"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Fonctionnalités ---------- */}
        <section id="fonctionnalites" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 md:py-20">
          <h2 className="font-[family-name:var(--font-display)] text-3xl">{t("landing.features.title")}</h2>
          <p className="mt-2 max-w-2xl text-[#5B6478]">{t("landing.features.subtitle")}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="rounded-2xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E7F3EF] text-[#2F6F5E]">
                  <f.icon className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[#5B6478]">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Pour qui ---------- */}
        <section className="bg-gradient-to-br from-[#1C2438] via-[#1A3129] to-[#1F4A3D] text-[#EDEFF2]">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-16">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-3xl">{t("landing.forWho.title")}</h2>
              <p className="mt-3 text-lg text-[#C9D0DC]">{t("landing.forWho.body")}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[#9FD3C3]">{t("landing.trust.title")}</h3>
              <ul className="mt-3 space-y-3">
                {trust.map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="pt-1">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------- Comment ça marche ---------- */}
        <section id="comment" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 md:py-20">
          <h2 className="font-[family-name:var(--font-display)] text-3xl">{t("landing.steps.title")}</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-[#E2E4E9] bg-white p-5 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2F6F5E] text-base font-semibold text-white">{i + 1}</span>
                <h3 className="mt-3 text-base font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-[#5B6478]">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Demander une démo ---------- */}
        <section id="demander-une-demo" className="scroll-mt-20 border-t border-[#E2E4E9] bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-[0.8fr_1.2fr] md:py-20">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-3xl">{t("landing.form.title")}</h2>
              <p className="mt-3 text-[#5B6478]">{t("landing.form.subtitle")}</p>
            </div>
            <div className="relative">
              <DemoRequestForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E2E4E9] bg-[#F7F8FA]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-6 text-sm text-[#5B6478] sm:px-6">
          <span>{t("landing.footer.rights", { year: new Date().getFullYear() })}</span>
          <Link href="/login" className="hover:text-[#1C2438]">{t("landing.nav.signIn")}</Link>
          <Link href="/register" className="hover:text-[#1C2438]">{t("landing.footer.createCompany")}</Link>
        </div>
      </footer>
    </div>
  );
}
