"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Building2, Loader2, Lock, Mail } from "lucide-react";
import { loginSchema } from "@/lib/validations/auth";
import { FormField } from "@/components/auth/FormField";
import { useI18n } from "@/components/i18n/I18nProvider";

type Values = { organizationSlug: string; email: string; password: string };
type Errors = Partial<Record<keyof Values | "form", string>>;

export function LoginForm() {
  const router = useRouter();
  const { t, tx } = useI18n();
  const params = useSearchParams();
  const justRegistered = params.get("registered") === "1";
  const justReset = params.get("reset") === "1"; // retour de « Mot de passe oublié » (AUDIT.md 7.35)
  const prefilledSlug = params.get("slug") ?? "";

  const [values, setValues] = useState<Values>({
    organizationSlug: prefilledSlug,
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(field: keyof Values) {
    return (e: ChangeEvent<HTMLInputElement>) => {
      setValues((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        fieldErrors[key] = tx(issue.message);
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        organizationSlug: parsed.data.organizationSlug.trim(),
        email: parsed.data.email, // adresse déjà nettoyée par loginSchema
        password: values.password,
        redirect: false,
      });

      if (!result || result.error) {
        // Anti-force brute (AUDIT.md 7.49) : message distinct quand la limite est atteinte.
        setErrors({ form: result?.error === "RATE_LIMITED" ? t("auth.login.tooManyAttempts") : t("auth.login.badCredentials") });
        return;
      }

      router.push("/dashboard");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {justReset && (
        <p className="animate-scale-in rounded-lg bg-[#EAF3F0] px-3 py-2.5 text-sm text-[#265A4C]">
          {t("auth.login.passwordReset")}
        </p>
      )}
      {justRegistered && (
        <p className="animate-scale-in rounded-lg bg-[#EAF3F0] px-3 py-2.5 text-sm text-[#265A4C]">
          {t("auth.login.registered", { slug: prefilledSlug })}
        </p>
      )}

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
        label={t("auth.fields.emailOrPhone")}
        name="email"
        type="text"
        icon={Mail}
        value={values.email}
        onChange={handleChange("email")}
        error={errors.email}
        placeholder={t("auth.placeholders.emailOrPhone")}
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <FormField
        label={t("auth.fields.password")}
        name="password"
        type="password"
        icon={Lock}
        value={values.password}
        onChange={handleChange("password")}
        error={errors.password}
        placeholder={t("auth.placeholders.password")}
        autoComplete="current-password"
      />
      <Link
        href={`/forgot-password${values.organizationSlug.trim() ? `?slug=${encodeURIComponent(values.organizationSlug.trim())}` : ""}`}
        className="-mt-3 self-end text-xs text-[#2F6F5E] hover:underline"
      >
        {t("auth.login.forgotPassword")}
      </Link>

      {errors.form && (
        <p className="animate-fade-in text-sm text-[#C2542C]" role="alert">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2.5 text-sm font-medium text-white shadow-[0_4px_14px_-4px_rgba(47,111,94,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-4px_rgba(47,111,94,0.6)] active:translate-y-0 active:shadow-[0_2px_8px_-2px_rgba(47,111,94,0.5)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_14px_-4px_rgba(47,111,94,0.5)]"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />}
        {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
      </button>
    </form>
  );
}
