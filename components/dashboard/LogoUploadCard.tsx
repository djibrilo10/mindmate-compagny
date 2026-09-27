"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { MAX_LOGO_SIZE, formatFileSize, isAllowedLogoType } from "@/lib/attachments";

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

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permet de resélectionner le même fichier plus tard
    if (!file) return;

    setError(null);

    if (!isAllowedLogoType(file.type)) {
      setError("Format non pris en charge. Utilise une image PNG, JPG ou WEBP.");
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      setError(`Cette image dépasse ${formatFileSize(MAX_LOGO_SIZE)}. Choisis-en une plus légère.`);
      return;
    }

    const formData = new FormData();
    formData.append("logo", file);

    setIsUploading(true);
    try {
      const res = await fetch("/api/organization/logo", { method: "POST", body: formData });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? "Impossible de téléverser ce logo.");
        return;
      }

      setHasLogo(true);
      setVersion(Date.now()); // force le rechargement de l'aperçu (nouveau logo, même URL)
    } catch {
      setError("Impossible de contacter le serveur.");
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
        setError(data?.error ?? "Impossible de retirer le logo.");
        return;
      }
      setHasLogo(false);
      setVersion(Date.now());
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setIsRemoving(false);
      setConfirmingRemove(false);
    }
  }

  return (
    <div className="max-w-xl rounded-xl border border-[#E4E7EE] bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <h2 className="text-sm font-medium text-[#1C2438]">Logo de l&apos;organisation</h2>
      <p className="mt-1 text-sm text-[#5B6478]">
        Ce logo remplace celui de la plateforme dans la barre latérale, pour
        tous tes employés une fois connectés. Chaque entreprise a le sien —
        PNG, JPG ou WEBP, 2 Mo maximum.
      </p>

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
              alt="Logo de l'organisation"
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
            {hasLogo ? "Changer le logo" : "Téléverser un logo"}
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
              {isRemoving ? "Retrait…" : confirmingRemove ? "Confirmer le retrait" : "Retirer"}
            </button>
          )}
          {confirmingRemove && !isRemoving && (
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="text-sm text-[#5B6478] hover:text-[#1C2438]"
            >
              Annuler
            </button>
          )}
        </div>
      </div>

      {!hasLogo && (
        <p className="mt-3 text-xs text-[#9AA3B5]">
          Aucun logo personnalisé — le logo par défaut de la plateforme est affiché en attendant.
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
