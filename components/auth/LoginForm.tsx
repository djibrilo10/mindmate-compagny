"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Building2, Loader2, Lock, Mail } from "lucide-react";
import { loginSchema } from "@/lib/validations/auth";
import { FormField } from "@/components/auth/FormField";

type Values = { organizationSlug: string; email: string; password: string };
type Errors = Partial<Record<keyof Values | "form", string>>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const justRegistered = params.get("registered") === "1";
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
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        organizationSlug: values.organizationSlug,
        email: values.email,
        password: values.password,
        redirect: false,
      });

      if (!result || result.error) {
        setErrors({ form: "Courriel ou mot de passe incorrect." });
        return;
      }

      router.push("/dashboard");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {justRegistered && (
        <p className="animate-scale-in rounded-lg bg-[#EAF3F0] px-3 py-2.5 text-sm text-[#265A4C]">
          Organisation créée. Votre identifiant d&apos;entreprise est{" "}
          <strong>{prefilledSlug}</strong> — gardez-le, il vous servira à
          chaque connexion.
        </p>
      )}

      <FormField
        label="Identifiant de l'entreprise"
        name="organizationSlug"
        icon={Building2}
        value={values.organizationSlug}
        onChange={handleChange("organizationSlug")}
        error={errors.organizationSlug}
        placeholder="entreprise-a-inc"
        autoComplete="organization"
      />
      <FormField
        label="Courriel"
        name="email"
        type="email"
        icon={Mail}
        value={values.email}
        onChange={handleChange("email")}
        error={errors.email}
        placeholder="vous@entreprise.com"
        autoComplete="email"
      />
      <FormField
        label="Mot de passe"
        name="password"
        type="password"
        icon={Lock}
        value={values.password}
        onChange={handleChange("password")}
        error={errors.password}
        placeholder="Votre mot de passe"
        autoComplete="current-password"
      />

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
        {isSubmitting ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
