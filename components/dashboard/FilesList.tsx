"use client";

import { useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, Trash2 } from "lucide-react";
import { formatFileSize } from "@/lib/attachments";

type Category = "schedule" | "policy" | "other";

const CATEGORY_LABELS: Record<Category, string> = {
  schedule: "Horaire",
  policy: "Politique",
  other: "Autre",
};

const CATEGORY_STYLES: Record<Category, string> = {
  schedule: "bg-[#E7F3EF] text-[#2F6F5E]",
  policy: "bg-[#FDF4E3] text-[#8A6D1D]",
  other: "bg-[#EEF1F5] text-[#5B6478]",
};

type FileItem = {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  category: string;
  weekLabel: string | null;
  createdAt: string;
  uploader: { firstName: string; lastName: string } | null;
};

function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType === "application/pdf") return <FileText className={className} strokeWidth={1.8} />;
  if (mimeType.startsWith("image/")) return <ImageIcon className={className} strokeWidth={1.8} />;
  return <Paperclip className={className} strokeWidth={1.8} />;
}

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category as Category] ?? category;
}

function categoryStyle(category: string) {
  return CATEGORY_STYLES[category as Category] ?? CATEGORY_STYLES.other;
}

export function FilesList({
  initialFiles,
  canManage,
}: {
  initialFiles: FileItem[];
  canManage: boolean;
}) {
  const [files, setFiles] = useState(initialFiles);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteFile(id: string) {
    const confirmed = window.confirm("Retirer définitivement ce document ?");
    if (!confirmed) return;

    const previous = files;
    setDeletingId(id);
    setFiles((current) => current.filter((f) => f.id !== id));

    try {
      const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      // On annule le retrait optimiste si la requête échoue côté serveur.
      setFiles(previous);
    } finally {
      setDeletingId(null);
    }
  }

  if (files.length === 0) {
    return (
      <div className="animate-fade-in-up stagger-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
        <FileText className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
        <p className="text-sm text-[#5B6478]">Aucun document pour le moment.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {files.map((file, index) => (
        <li
          key={file.id}
          style={{ animationDelay: `${Math.min(index, 10) * 0.04}s` }}
          className="animate-fade-in-up flex items-center justify-between gap-3 rounded-xl border border-[#E2E4E9] bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
        >
          <a
            href={`/api/files/${file.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F7F8FA] text-[#5B6478]">
              <FileIcon mimeType={file.mimeType} className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-[#1C2438]">{file.fileName}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${categoryStyle(file.category)}`}
                >
                  {categoryLabel(file.category)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-[#9AA1B2]">
                {file.weekLabel ? `${file.weekLabel} · ` : ""}
                {formatFileSize(file.fileSize)}
                {file.uploader ? ` · ${file.uploader.firstName} ${file.uploader.lastName}` : ""}
                {" · "}
                {new Date(file.createdAt).toLocaleDateString("fr-CA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            </div>
          </a>

          {canManage && (
            <button
              onClick={() => deleteFile(file.id)}
              disabled={deletingId === file.id}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#8A3B3B] px-2 py-1 text-xs font-medium text-[#8A3B3B] transition-colors hover:bg-[#FDECEC] disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" strokeWidth={2} />
              Retirer
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
