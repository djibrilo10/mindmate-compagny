import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { getI18n } from "@/lib/i18n/server";

export default async function LoginPage() {
  const { t } = await getI18n();
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C2438]">
        {t("auth.login.title")}
      </h1>
      <p className="mt-2 text-sm text-[#5B6478]">
        {t("auth.login.subtitle")}
      </p>

      <div className="mt-8">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>

      <p className="mt-8 text-sm text-[#5B6478]">
        {t("auth.login.noAccount")}{" "}
        <Link href="/register" className="text-[#2F6F5E] hover:underline">
          {t("auth.login.createOrg")}
        </Link>
      </p>
      <p className="mt-2 text-sm text-[#5B6478]">
        {t("auth.login.isEmployee")}{" "}
        <Link href="/join" className="text-[#2F6F5E] hover:underline">
          {t("auth.login.joinWithCode")}
        </Link>
      </p>
    </div>
  );
}
