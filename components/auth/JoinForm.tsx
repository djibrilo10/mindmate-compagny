"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
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

type Errors = Partial<Record<keyof Values | "form" | "department", string>>;

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
  // Départements proposés par l'admin (AUDIT.md 7.34), chargés dès que le
  // code d'invitation est complet.
  const [org, setOrg] = useState<{ name: string; departments: { id: string; name: string; color: string }[] } | null>(null);
  const [orgLoading, setOrgLoading] = useState(false);
  const [departmentId, setDepartmentId] = useState("");

  useEffect(() => {
    const code = values.inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setOrg(null);
    setDepartmentId("");
    if (code.length !== 8) return;
    const controller = new AbortController();
    setOrgLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/auth/join/departments?code=${encodeURIComponent(code)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          setOrg({ name: data.organizationName, departments: data.departments ?? [] });
          if (data.departments?.length === 1) setDepartmentId(data.departments[0].id);
        })
        .catch(() => {})
        .finally(() => setOrgLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [values.inviteCode]);
  const mustChooseDepartment = (org?.departments.length ?? 0) > 1;

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

    if (mustChooseDepartment && !departmentId) {
      setErrors({ department: t("departments.errors.chooseOne") });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, departmentId: departmentId || undefined }),
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
      {orgLoading && <Loader2 className="-mt-3 h-4 w-4 animate-spin text-[#9AA3B5]" aria-hidden />}
      {org && (
        <p className="-mt-3 flex items-center gap-1.5 text-sm text-[#2F6F5E]">
          <CheckCircle2 className="h-4 w-4" /> {org.name}
        </p>
      )}
      {org && mustChooseDepartment && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[#1C2438]">{t("departments.join.label")}</span>
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-[#1C2438] outline-none focus:border-[#2F6F5E] focus:ring-4 focus:ring-[#2F6F5E]/12 ${
              errors.department ? "border-[#C2542C]" : "border-[#DADEE5]"
            }`}
          >
            <option value="">{t("departments.join.placeholder")}</option>
            {org.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-[#5B6478]">{t("departments.join.hint")}</span>
          {errors.department && (
            <span className="text-xs text-[#C2542C]" role="alert">
              {errors.department}
            </span>
          )}
        </label>
      )}
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
