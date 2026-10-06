"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { FormField } from "@/components/auth/FormField";
import { useI18n } from "@/components/i18n/I18nProvider";

// Choix du nouveau mot de passe depuis un lien de réinitialisation (AUDIT.md 7.35).

type Values = { password: string; confirmPassword: string };
type Errors = Partial<Record<keyof Values | "form", string>>;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const { t, tx } = useI18n();
  const [values, setValues] = useState<Values>({ password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(field: keyof Values) {
    return (e: ChangeEvent<HTMLInputElement>) => setValues((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    const parsed = resetPasswordSchema.safeParse({ token, ...values });
    if (!parsed.success) {
      const fieldErrors: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Errors;
        if (key === "password" || key === "confirmPassword") fieldErrors[key] ??= tx(issue.message);
        else fieldErrors.form = tx(issue.message);
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors({ form: data?.error ? tx(data.error) : t("common.operationFailed") });
        return;
      }
      const slug = typeof data?.organizationSlug === "string" ? data.organizationSlug : "";
      router.push(`/login?reset=1${slug ? `&slug=${encodeURIComponent(slug)}` : ""}`);
    } catch {
      setErrors({ form: t("common.operationFailed") });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <FormField
        label={t("auth.reset.newPassword")}
        name="password"
        type="password"
        icon={Lock}
        value={values.password}
        onChange={handleChange("password")}
        error={errors.password}
        placeholder={t("auth.placeholders.newPassword")}
        autoComplete="new-password"
      />
      <FormField
        label={t("auth.reset.confirmPassword")}
        name="confirmPassword"
        type="password"
        icon={Lock}
        value={values.confirmPassword}
        onChange={handleChange("confirmPassword")}
        error={errors.confirmPassword}
        placeholder={t("auth.reset.confirmPlaceholder")}
        autoComplete="new-password"
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
        {isSubmitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
      </button>
    </form>
  );
}
