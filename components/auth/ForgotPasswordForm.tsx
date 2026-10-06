"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, Loader2, Mail, MailCheck } from "lucide-react";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { FormField } from "@/components/auth/FormField";
import { useI18n } from "@/components/i18n/I18nProvider";

// « Mot de passe oublié » (AUDIT.md 7.35) : identifiant d'entreprise + courriel.
// Après l'envoi, on affiche toujours le même message, que le compte existe
// ou non (on ne révèle jamais quelles adresses sont inscrites).

type Values = { organizationSlug: string; email: string };
type Errors = Partial<Record<keyof Values | "form", string>>;

export function ForgotPasswordForm() {
  const { t, tx } = useI18n();
  const params = useSearchParams();
  const [values, setValues] = useState<Values>({
    organizationSlug: params.get("slug") ?? "",
    email: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  function handleChange(field: keyof Values) {
    return (e: ChangeEvent<HTMLInputElement>) => setValues((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const parsed = forgotPasswordSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Errors = {};
      for (const issue of parsed.error.issues) fieldErrors[issue.path[0] as keyof Errors] = tx(issue.message);
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors({ form: data?.error ? tx(data.error) : t("common.operationFailed") });
        return;
      }
      setSent(true);
    } catch {
      setErrors({ form: t("common.operationFailed") });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="animate-scale-in rounded-xl border border-[#2F6F5E]/25 bg-[#EAF3F0] p-5">
        <MailCheck className="h-6 w-6 text-[#2F6F5E]" strokeWidth={1.9} />
        <p className="mt-3 text-sm font-medium text-[#1C2438]">{t("auth.forgot.sentTitle")}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-[#5B6478]">{t("auth.forgot.sentBody")}</p>
        <p className="mt-3 text-xs leading-relaxed text-[#5B6478]">{t("auth.forgot.noEmailAccess")}</p>
        <Link href={`/login${values.organizationSlug ? `?slug=${encodeURIComponent(values.organizationSlug.trim())}` : ""}`} className="mt-4 inline-block text-sm text-[#2F6F5E] hover:underline">
          {t("auth.forgot.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <FormField
        label={t("auth.fields.organizationSlug")}
        name="organizationSlug"
        icon={Building2}
        value={values.organizationSlug}
        onChange={handleChange("organizationSlug")}
        error={errors.organizationSlug}
        placeholder={t("auth.placeholders.organizationSlug")}
        autoComplete="organization"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <FormField
        label={t("auth.fields.email")}
        name="email"
        type="email"
        icon={Mail}
        value={values.email}
        onChange={handleChange("email")}
        error={errors.email}
        placeholder={t("auth.placeholders.email")}
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />

      {errors.form && (
        <p className="animate-fade-in text-sm text-[#C2542C]" role="alert">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2.5 text-sm font-medium text-white shadow-[0_4px_14px_-4px_rgba(47,111,94,0.5)] transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />}
        {isSubmitting ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
      </button>
    </form>
  );
}
