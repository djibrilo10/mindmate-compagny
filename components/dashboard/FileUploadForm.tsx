"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import {
  MAX_TOTAL_ATTACHMENTS_SIZE,
  MAX_ATTACHMENTS_PER_UPLOAD,
  formatFileSize,
} from "@/lib/attachments";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";

type Category = "schedule" | "policy" | "other";

const CATEGORY_LABELS: Record<Category, string> = {
  schedule: "Horaire",
  policy: "Politique",
  other: "Autre",
};

export function FileUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<Category>("other");
  const [weekLabel, setWeekLabel] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function handleFilesChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files || []);
    setErrorMessage("");

    if (picked.length > MAX_ATTACHMENTS_PER_UPLOAD) {
      setErrorMessage(`Maximum ${MAX_ATTACHMENTS_PER_UPLOAD} fichiers à la fois.`);
      event.target.value = "";
      setFiles([]);
      return;
    }
    const totalSize = picked.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_ATTACHMENTS_SIZE) {
      setErrorMessage(
        `Ces fichiers dépassent la limite de ${formatFileSize(MAX_TOTAL_ATTACHMENTS_SIZE)} au total (${formatFileSize(totalSize)} sélectionnés).`
      );
      event.target.value = "";
      setFiles([]);
      return;
    }
    setFiles(picked);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (files.length === 0) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("category", category);
      if (category === "schedule" && weekLabel.trim()) {
        formData.append("weekLabel", weekLabel.trim());
      }

      const response = await fetch("/api/files", { method: "POST", body: formData });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors du téléversement");
      }

      setFiles([]);
      setWeekLabel("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus("success");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Erreur inconnue");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-sm"
    >
      <h2 className="font-[family-name:var(--font-display)] text-lg text-[#1C2438]">
        Téléverser un document
      </h2>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1C2438]">Catégorie</label>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
            className="mt-1 w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
          >
            {(Object.keys(CATEGORY_LABELS) as Category[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABELS[key]}
              </option>
            ))}
          </select>
        </div>

        {category === "schedule" && (
          <div>
            <label className="block text-sm font-medium text-[#1C2438]">
              Semaine concernée (facultatif)
            </label>
            <input
              type="text"
              value={weekLabel}
              onChange={(event) => setWeekLabel(event.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E2E4E9] px-3 py-2 text-sm transition-colors hover:border-[#C7CBD6] focus:border-[#2F6F5E] focus:outline-none focus:ring-4 focus:ring-[#2F6F5E]/12"
              placeholder="Ex : Semaine du 22 septembre 2026"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[#1C2438]">Fichiers</label>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            onChange={handleFilesChange}
            className="mt-1 w-full text-sm text-[#5B6478] file:mr-3 file:rounded-md file:border-0 file:bg-[#EEF1F5] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#1C2438] hover:file:bg-[#E2E4E9]"
          />
          <p className="mt-1 text-xs text-[#9AA1B2]">
            PDF, JPG, PNG ou WEBP — {formatFileSize(MAX_TOTAL_ATTACHMENTS_SIZE)} max au total,{" "}
            {MAX_ATTACHMENTS_PER_UPLOAD} fichiers max.
          </p>

          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between rounded-md bg-[#F7F8FA] px-3 py-1.5 text-xs text-[#1C2438]"
                >
                  <span className="truncate">
                    {file.name} · {formatFileSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="ml-3 inline-flex shrink-0 items-center gap-0.5 text-[#8A3B3B] hover:underline"
                  >
                    <X className="h-3 w-3" strokeWidth={2.2} />
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === "loading" || files.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#3D8C76] to-[#265A4C] px-4 py-2 text-sm font-medium text-white shadow-[0_2px_10px_-2px_rgba(47,111,94,0.5)] transition-all hover:-translate-y-px hover:shadow-[0_4px_14px_-2px_rgba(47,111,94,0.6)] disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <Upload className="h-4 w-4" strokeWidth={2} />
            )}
            {status === "loading" ? "Envoi..." : "Téléverser"}
          </button>
          {status === "success" && (
            <span className="inline-flex items-center gap-1 text-sm text-[#2F6F5E]">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
              Document(s) téléversé(s).
            </span>
          )}
          {status === "error" && (
            <span className="inline-flex items-center gap-1 text-sm text-[#8A3B3B]">
              <AlertCircle className="h-4 w-4" strokeWidth={2} />
              {errorMessage}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
