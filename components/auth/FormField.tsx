import type { InputHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

type FormFieldProps = {
  label: string;
  error?: string;
  icon?: LucideIcon;
} & InputHTMLAttributes<HTMLInputElement>;

export function FormField({ label, error, icon: Icon, ...inputProps }: FormFieldProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[#1C2438]">{label}</span>
      <span className="relative flex items-center">
        {Icon && (
          <Icon
            aria-hidden
            className="pointer-events-none absolute left-3 h-4 w-4 text-[#9AA3B5]"
            strokeWidth={1.75}
          />
        )}
        <input
          {...inputProps}
          className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-[#1C2438] outline-none transition-all duration-200 placeholder:text-[#9AA3B5] focus:border-[#2F6F5E] focus:ring-4 focus:ring-[#2F6F5E]/12 ${
            Icon ? "pl-9" : ""
          } ${error ? "border-[#C2542C]" : "border-[#DADEE5] hover:border-[#C3C9D4]"}`}
          aria-invalid={Boolean(error)}
        />
      </span>
      {error && (
        <span className="animate-fade-in text-xs text-[#C2542C]" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
