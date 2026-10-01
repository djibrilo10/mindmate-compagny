"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { MAX_LOGO_SIZE, formatFileSize, isAllowedLogoType } from "@/lib/attachments";
import { useI18n } from "@/components/i18n/I18nProvider";

export function LogoUploadCard({
  hasCustomLogo,
  logoVersion,
}: {
  hasCustomLogo: boolean;
  logoVersion: number;
}) {
  const [hasLogo, setHasLogo] = useState(hasCustomLogo);
  const [version, setVersion] = useState(logoVersion || Date.now());
  const [isUploading, setIsUploading] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t, tx } = useI18n();

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de resélectionner le même fichier plus tard
    if (!file) return;

    setError(null);

    if (!isAllowedLogoType(file.type)) {
      setError(t("settings.logo.badFormat"));
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError(t("settings.logo.tooBig", { size: formatFileSize(MAX_LOGO_SIZE) }));
      return;
    }

    const formData = new FormData();
    formData.append("logo", file);

    setIsUploading(true);
    try {
      const res = await fetch("/api/organization/logo", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ? tx(data.error) : t("settings.logo.uploadFailed"));
        return;
      }

      setHasLogo(true);
      setVersion(Date.now()); // force le rechargement de l'aperçu (nouveau logo, même URL)
    } catch {
      setError(t("common.serverUnreachable"));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemove() {
    if (!confirmingRemove) {
      setConfirmingRemove(true);
      return;
    }

    setIsRemoving(true);
    setError(null);
    try {
      const res = await fetch("/api/organization/logo", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ? tx(data.error) : t("settings.logo.removeFailed"));
        return;
      }
      setHasLogo(false);
      setVersion(Date.now());
    } catch {
      setError(t("common.serverUnreachable"));
    } finally {
      setIsRemoving(false);
      setConfirmingRemove(false);
    }
  }

  return (
    <div className="max-w-xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <h2 className="text-sm font-medium text-[#1C2438]">{t("settings.logo.title")}</h2>
      <p className="mt-1 text-sm text-[#5B6478]">{t("settings.logo.description")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {/* Aperçu fidèle à ce que verra l'employé dans la barre latérale
            (même fond blanc, même hauteur) — voir DashboardShell.tsx. */}
        <div className="flex h-16 w-56 shrink-0 items-center justify-center rounded-xl border border-[#E4E7EE] bg-white p-3">
          {isUploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-[#9AA3B5]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={version}
              src={`/api/organization/logo?v=${version}`}
              alt={t("settings.logo.alt")}
              className="h-full w-full object-contain"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#DADEE5] px-3 py-2 text-sm font-medium text-[#1C2438] transition-colors hover:border-[#2F6F5E] hover:text-[#2F6F5E] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <ImageUp className="h-4 w-4" strokeWidth={1.9} />
            {hasLogo ? t("settings.logo.change") : t("settings.logo.upload")}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />

          {hasLogo && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={isRemoving}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                confirmingRemove
                  ? "bg-[#C2542C] text-white hover:bg-[#A8451F]"
                  : "border border-[#DADEE5] text-[#1C2438] hover:border-[#C2542C] hover:text-[#C2542C]"
              }`}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.9} />
              {isRemoving
                ? t("settings.logo.removing")
                : confirmingRemove
                  ? t("settings.logo.confirmRemove")
                  : t("settings.logo.remove")}
            </button>
          )}
          {confirmingRemove && !isRemoving && (
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="text-sm text-[#5B6478] hover:text-[#1C2438]"
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      </div>

      {!hasLogo && (
        <p className="mt-3 text-xs text-[#9AA3B5]">
          {t("settings.logo.noCustom")}
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm text-[#C2542C]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
