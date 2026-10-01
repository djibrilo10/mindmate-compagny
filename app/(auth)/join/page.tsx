import Link from "next/link";
import { JoinForm } from "@/components/auth/JoinForm";
import { getI18n } from "@/lib/i18n/server";

export default async function JoinPage() {
  const { t } = await getI18n();
  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C2438]">
        {t("auth.join.title")}
      </h1>
      <p className="mt-2 text-sm text-[#5B6478]">
        {t("auth.join.subtitle")}
      </p>

      <div className="mt-8">
        <JoinForm />
      </div>

      <p className="mt-8 text-sm text-[#5B6478]">
        {t("auth.join.isAdmin")}{" "}
        <Link href="/register" className="text-[#2F6F5E] hover:underline">
          {t("auth.join.registerOrg")}
        </Link>
      </p>
    </div>
  );
}
