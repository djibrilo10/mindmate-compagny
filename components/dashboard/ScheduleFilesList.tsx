"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, FileSpreadsheet, FileText, Loader2, Trash2, Users } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { formatFileSize } from "@/lib/attachments";

// Horaires téléversés en fichier pour la semaine (AUDIT.md 7.39) : visibles
// par les employés concernés ; le gérant peut aussi les retirer.

export type ScheduleFileItem = {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  department: { name: string; color: string } | null;
  canDelete: boolean;
};

function isSpreadsheet(mime: string) {
  return mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv";
}

export function ScheduleFilesList({ files }: { files: ScheduleFileItem[] }) {
  const router = useRouter();
  const { t, tx } = useI18n();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (files.length === 0) return null;

  async function remove(id: string) {
    if (!window.confirm(t("schedule.upload.confirmDelete"))) return;
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/schedule-files/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.unknownError"));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="rounded-xl border border-[#E2E4E9] bg-white p-3.5 shadow-sm">
      <h2 className="text-sm font-semibold text-[#1C2438]">{t("schedule.upload.listTitle")}</h2>
      <ul className="mt-2.5 space-y-2">
        {files.map((f) => {
          const Icon = isSpreadsheet(f.mimeType) ? FileSpreadsheet : FileText;
          const previewable = f.mimeType === "application/pdf" || f.mimeType.startsWith("image/");
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#E2E4E9] px-3 py-2.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E7F3EF] text-[#2F6F5E]">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-semibold text-[#1C2438]">{f.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[#5B6478]">
                  <span className="truncate">{f.fileName}</span>
                  <span>· {formatFileSize(f.fileSize)}</span>
                  <span className="inline-flex items-center gap-1">
                    ·{" "}
                    {f.department ? (
                      <>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.department.color }} aria-hidden />
                        {f.department.name}
                      </>
                    ) : (
                      <>
                        <Users className="h-3 w-3" /> {t("schedule.upload.everyone")}
                      </>
                    )}
                  </span>
                </p>
              </div>
              <div className="flex w-full items-center gap-1.5 sm:w-auto">
                <a
                  href={`/api/schedule-files/${f.id}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#2F6F5E] px-3 py-2 text-sm font-medium text-white sm:flex-none"
                >
                  {previewable ? <Eye className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                  {previewable ? t("schedule.upload.open") : t("schedule.upload.download")}
                </a>
                {f.canDelete && (
                  <button
                    type="button"
                    onClick={() => remove(f.id)}
                    disabled={deleting !== null}
                    aria-label={t("schedule.delete")}
                    className="rounded-lg border border-[#E2E4E9] p-2 text-[#8A3B3B] hover:bg-[#FDECEC] disabled:opacity-50"
                  >
                    {deleting === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="mt-2 text-sm text-[#8A3B3B]" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
