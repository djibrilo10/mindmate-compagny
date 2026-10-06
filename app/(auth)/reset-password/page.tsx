import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { findValidResetToken } from "@/lib/password-reset";
import { getI18n } from "@/lib/i18n/server";

// Page ouverte depuis le lien de réinitialisation (AUDIT.md 7.35). Le lien
// est vérifié ici AVANT d'afficher le formulaire : un lien expiré ou déjà
// utilisé affiche directement un message clair, au lieu d'un formulaire
// qui échouerait à l'envoi.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { t } = await getI18n();
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const valid = token ? await findValidResetToken(token) : null;

  if (!valid) {
    return (
      <div>
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FDECEC] text-[#8A3B3B]">
          <LinkIcon className="h-6 w-6" strokeWidth={1.9} />
        </span>
        <h1 className="mt-5 font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">{t("auth.reset.invalidTitle")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#5B6478]">{t("auth.reset.invalidBody")}</p>
        <div className="mt-6 flex flex-col gap-2 text-sm">
          <Link href="/forgot-password" className="text-[#2F6F5E] hover:underline">
            {t("auth.reset.requestNew")}
          </Link>
          <Link href="/login" className="text-[#5B6478] hover:underline">
            {t("auth.forgot.backToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[#1C2438]">{t("auth.reset.title")}</h1>
      <p className="mt-2 text-sm text-[#5B6478]">{t("auth.reset.subtitle")}</p>
      <div className="mt-8">
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
