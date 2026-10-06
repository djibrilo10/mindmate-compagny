import { Suspense } from "react";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getI18n } from "@/lib/i18n/server";

// « Mot de passe oublié » (AUDIT.md 7.35) — page publique.
export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C2438]">{t("auth.forgot.title")}</h1>
      <p className="mt-2 text-sm text-[#5B6478]">{t("auth.forgot.subtitle")}</p>

      <div className="mt-8">
        <Suspense fallback={null}>
          <ForgotPasswordForm />
        </Suspense>
      </div>

      <p className="mt-8 text-sm text-[#5B6478]">
        <Link href="/login" className="text-[#2F6F5E] hover:underline">
          {t("auth.forgot.backToLogin")}
        </Link>
      </p>
    </div>
  );
}
