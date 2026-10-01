"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { joinSchema } from "@/lib/validations/auth";
import { FormField } from "@/components/auth/FormField";
import { useI18n } from "@/components/i18n/I18nProvider";

type Values = {
  inviteCode: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

type Errors = Partial<Record<keyof Values | "form", string>>;

const initialValues: Values = {
  inviteCode: "",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
};

export function JoinForm() {
  const router = useRouter();
  const { t, tx } = useI18n();
  const [values, setValues] = useState<Values>(initialValues);
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

    const parsed = joinSchema.safeParse(values);
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
      const res = await fetch("/api/auth/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setErrors({ form: data?.error ? tx(data.error) : t("common.genericError") });
        return;
      }

      // Compte actif immédiatement : on connecte la personne tout de suite
      // avec les identifiants qu'elle vient de choisir, plutôt que de la
      // renvoyer vers /login où elle devrait retaper un identifiant
      // d'entreprise (le slug) qu'elle ne connaît pas — seul le code
      // d'invitation lui a été communiqué.
      const result = await signIn("credentials", {
        organizationSlug: data.organizationSlug,
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });

      if (!result || result.error) {
        router.push(`/login?registered=1&slug=${encodeURIComponent(data.organizationSlug)}`);
        return;
      }

      router.push("/dashboard");
    } catch {
      setErrors({ form: t("common.serverUnreachableRetry") });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <FormField
        label={t("auth.fields.inviteCode")}
        name="inviteCode"
        value={values.inviteCode}
        onChange={handleChange("inviteCode")}
        error={errors.inviteCode}
        placeholder="XK7P-2QRT"
        autoComplete="off"
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label={t("auth.fields.firstName")}
          name="firstName"
          value={values.firstName}
          onChange={handleChange("firstName")}
          error={errors.firstName}
          placeholder="Alex"
          autoComplete="given-name"
        />
        <FormField
          label={t("auth.fields.lastName")}
          name="lastName"
          value={values.lastName}
          onChange={handleChange("lastName")}
          error={errors.lastName}
          placeholder="Tremblay"
          autoComplete="family-name"
        />
      </div>
      <FormField
        label={t("auth.fields.email")}
        name="email"
        type="email"
        value={values.email}
        onChange={handleChange("email")}
        error={errors.email}
        placeholder={t("auth.placeholders.emailExample")}
        autoComplete="email"
      />
      <FormField
        label={t("auth.fields.password")}
        name="password"
        type="password"
        value={values.password}
        onChange={handleChange("password")}
        error={errors.password}
        placeholder={t("auth.placeholders.newPassword")}
        autoComplete="new-password"
      />

      {errors.form && (
        <p className="text-sm text-[#C2542C]" role="alert">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-2 rounded-md bg-[#2F6F5E] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#265A4C] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? t("auth.join.submitting") : t("auth.join.submit")}
      </button>
    </form>
  );
}
