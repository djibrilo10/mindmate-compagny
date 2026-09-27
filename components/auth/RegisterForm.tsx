"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Lock, Mail, User } from "lucide-react";
import { registerSchema } from "@/lib/validations/auth";
import { FormField } from "@/components/auth/FormField";

type Values = {
  organizationName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

type Errors = Partial<Record<keyof Values | "form", string>>;

const initialValues: Values = {
  organizationName: "",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
};

export function RegisterForm() {
  const router = useRouter();
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

    const parsed = registerSchema.safeParse(values);
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setErrors({ form: data?.error ?? "Une erreur est survenue. Réessayez." });
        return;
      }

      router.push(`/login?registered=1&slug=${encodeURIComponent(data.slug)}`);
    } catch {
      setErrors({ form: "Impossible de contacter le serveur. Réessayez." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <FormField
        label="Nom de l'entreprise"
        name="organizationName"
        icon={Building2}
        value={values.organizationName}
        onChange={handleChange("organizationName")}
        error={errors.organizationName}
        placeholder="Entreprise A inc."
        autoComplete="organization"
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Prénom"
          name="firstName"
          icon={User}
          value={values.firstName}
          onChange={handleChange("firstName")}
          error={errors.firstName}
          placeholder="Alex"
          autoComplete="given-name"
        />
        <FormField
          label="Nom"
          name="lastName"
          value={values.lastName}
          onChange={handleChange("lastName")}
          error={errors.lastName}
          placeholder="Tremblay"
          autoComplete="family-name"
        />
      </div>
      <FormField
        label="Courriel"
        name="email"
        type="email"
        icon={Mail}
        value={values.email}
        onChange={handleChange("email")}
        error={errors.email}
        placeholder="alex@entreprisea.com"
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
        placeholder="8 caractères, une majuscule, un chiffre"
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
        className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2.5 text-sm font-medium text-white shadow-[0_4px_14px_-4px_rgba(47,111,94,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-4px_rgba(47,111,94,0.6)] active:translate-y-0 active:shadow-[0_2px_8px_-2px_rgba(47,111,94,0.5)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_14px_-4px_rgba(47,111,94,0.5)]"
      >
        {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />}
        {isSubmitting ? "Création en cours…" : "Créer l'organisation"}
      </button>
    </form>
  );
}
