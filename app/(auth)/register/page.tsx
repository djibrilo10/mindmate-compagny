import Link from "next/link";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getI18n } from "@/lib/i18n/server";

export default async function RegisterPage() {
  const { t } = await getI18n();
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C2438]">
        {t("auth.register.title")}
      </h1>
      <p className="mt-2 text-sm text-[#5B6478]">
        {t("auth.register.subtitle")}
      </p>

      <div className="mt-8">
        <RegisterForm />
      </div>

      <p className="mt-8 text-sm text-[#5B6478]">
        {t("auth.register.hasAccount")}{" "}
        <Link href="/login" className="text-[#2F6F5E] hover:underline">
          {t("auth.register.signIn")}
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
