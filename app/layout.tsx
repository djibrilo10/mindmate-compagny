import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PwaRegister } from "@/components/PwaRegister";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { getI18n, getLocale } from "@/lib/i18n/server";
import { dictionaries } from "@/lib/i18n/dictionaries";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Titre de l'onglet dans la langue de la personne (FR/EN, AUDIT.md 7.29).
export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getI18n();
  return {
    title: t("shell.portal"),
    description:
      locale === "en"
        ? "Multi-company employee portal: reports, absences, documents, announcements and more."
        : "Portail employé multi-entreprise : signalements, absences, documents, annonces et plus.",
    ...baseMetadata,
  };
}

const baseMetadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mindmate Compagny",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2F6F5E",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale} messages={dictionaries[locale]}>
          {children}
        </I18nProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
