"use client";

import { useState } from "react";
import { FileText, Image as ImageIcon, Megaphone, Paperclip, Trash2, X } from "lucide-react";
import { formatFileSize } from "@/lib/attachments";

type Attachment = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
};

type Announcement = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: { firstName: string; lastName: string } | null;
  attachments: Attachment[];
};

function FileIcon({ fileType, className }: { fileType: string; className?: string }) {
  if (fileType === "application/pdf") return <FileText className={className} strokeWidth={1.8} />;
  if (fileType.startsWith("image/")) return <ImageIcon className={className} strokeWidth={1.8} />;
  return <Paperclip className={className} strokeWidth={1.8} />;
}

export function AnnouncementsList({
  initialAnnouncements,
  canManage,
}: {
  initialAnnouncements: Announcement[];
  canManage: boolean;
}) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);

  async function deleteAnnouncement(id: string) {
    const confirmed = window.confirm(
      "Retirer définitivement cette annonce ? Les fichiers joints seront supprimés aussi."
    );
    if (!confirmed) return;

    const previous = announcements;
    setDeletingId(id);
    setAnnouncements((current) => current.filter((a) => a.id !== id));

    try {
      const response = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
    } catch {
      // On annule le retrait optimiste si la requête échoue côté serveur.
      setAnnouncements(previous);
    } finally {
      setDeletingId(null);
    }
  }

  async function removeAttachment(announcementId: string, attachmentId: string) {
    const previous = announcements;
    setRemovingAttachmentId(attachmentId);
    setAnnouncements((current) =>
      current.map((a) =>
        a.id === announcementId
          ? { ...a, attachments: a.attachments.filter((f) => f.id !== attachmentId) }
          : a
      )
    );

    try {
      const response = await fetch(
        `/api/announcements/${announcementId}/attachments/${attachmentId}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error();
    } catch {
      setAnnouncements(previous);
    } finally {
      setRemovingAttachmentId(null);
    }
  }

  if (announcements.length === 0) {
    return (
      <div className="animate-fade-in-up stagger-2 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
        <Megaphone className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
        <p className="text-sm text-[#5B6478]">Aucune annonce pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {announcements.map((announcement, index) => (
        <div
          key={announcement.id}
          style={{ animationDelay: `${Math.min(index, 10) * 0.04}s` }}
          className="animate-fade-in-up rounded-xl border border-[#E2E4E9] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="font-medium text-[#1C2438]">{announcement.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[#5B6478]">
                {announcement.content}
              </p>
              <p className="mt-2 text-xs text-[#9AA1B2]">
                {announcement.author
                  ? `${announcement.author.firstName} ${announcement.author.lastName}`
                  : "—"}
                {" · "}
                {new Date(announcement.createdAt).toLocaleDateString("fr-CA", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>

              {announcement.attachments.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {announcement.attachments.map((file) => (
                    <li key={file.id} className="flex items-center gap-2">
                      <a
                        href={`/api/announcements/${announcement.id}/attachments/${file.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-[#F7F8FA] px-3 py-1.5 text-xs text-[#1C2438] transition-colors hover:bg-[#EEF1F5]"
                      >
                        <FileIcon fileType={file.fileType} className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{file.fileName}</span>
                        <span className="shrink-0 text-[#9AA1B2]">
                          ({formatFileSize(file.fileSize)})
                        </span>
                      </a>
                      {canManage && (
                        <button
                          onClick={() => removeAttachment(announcement.id, file.id)}
                          disabled={removingAttachmentId === file.id}
                          className="inline-flex shrink-0 items-center gap-0.5 text-xs text-[#8A3B3B] hover:underline disabled:opacity-50"
                        >
                          <X className="h-3 w-3" strokeWidth={2.2} />
                          Retirer
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {canManage && (
              <button
                onClick={() => deleteAnnouncement(announcement.id)}
                disabled={deletingId === announcement.id}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#8A3B3B] px-2 py-1 text-xs font-medium text-[#8A3B3B] transition-colors hover:bg-[#FDECEC] disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" strokeWidth={2} />
                Retirer l&apos;annonce
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
