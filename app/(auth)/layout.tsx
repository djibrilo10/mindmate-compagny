import type { ReactNode } from "react";
import { Fraunces, Inter } from "next/font/google";
import { OrgIllustration } from "@/components/auth/OrgIllustration";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${fraunces.variable} ${inter.variable} font-[family-name:var(--font-body)] grid min-h-screen grid-cols-1 bg-[radial-gradient(ellipse_at_top,_#FFFFFF_0%,_#F3F5F8_60%)] lg:grid-cols-[minmax(0,440px)_1fr]`}
    >
      {/* Dégradé marine → vert profond, avec deux formes floues qui dérivent
          lentement (pur CSS, voir app/globals.css) pour donner de la
          profondeur sans jamais distraire du contenu. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1C2438] via-[#1A3129] to-[#1F4A3D] px-12 py-14 text-[#EDEFF2] lg:flex">
        <div
          aria-hidden
          className="animate-float-blob pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#2F6F5E] opacity-25 blur-[90px]"
        />
        <div
          aria-hidden
          className="animate-float-blob-alt pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-[#3E7CA6] opacity-[0.15] blur-[100px]"
        />

        <div className="relative flex items-center gap-2.5 animate-fade-in-up">
          {/* Logo Mindmate Compagny (voir AUDIT.md 14) — remplace le badge "PE" */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark-white.png" alt="" aria-hidden className="h-8 w-8 shrink-0 object-contain" />
          <span className="font-[family-name:var(--font-display)] text-xl tracking-tight">
            Portail employé
          </span>
        </div>

        <div className="relative flex flex-col items-start gap-8">
          <div className="animate-scale-in stagger-3">
            <OrgIllustration />
          </div>
          <p className="max-w-xs animate-fade-in-up stagger-4 font-[family-name:var(--font-display)] text-2xl leading-snug">
            Une organisation, ses départements, ses employés — au même endroit.
          </p>
        </div>

        <p className="relative max-w-xs animate-fade-in-up stagger-5 text-sm text-[#9AA3B5]">
          Signalements, absences, horaires et annonces, réunis dans un seul espace pour toute l&apos;équipe.
        </p>
      </aside>

      <main className="flex items-center justify-center px-6 py-14 sm:px-12">
        <div className="w-full max-w-sm animate-fade-in-up stagger-1">{children}</div>
      </main>
    </div>
  );
}
