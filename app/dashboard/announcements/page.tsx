import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { Megaphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { AnnouncementForm } from "@/components/dashboard/AnnouncementForm";
import { AnnouncementsList } from "@/components/dashboard/AnnouncementsList";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

export default async function AnnouncementsPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const canManage = ADMIN_ROLES.includes(ctx.role);

  // Tout le monde voit les annonces de son organisation, mais seul un admin
  // peut en publier ou en retirer (voir ADMIN_ROLES dans l'API).
  const announcements = await prisma.announcement.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { firstName: true, lastName: true } },
      // Jamais "data" (le contenu binaire) ici : seulement de quoi afficher
      // un lien vers /api/announcements/[id]/attachments/[attachmentId].
      attachments: {
        select: { id: true, fileName: true, fileType: true, fileSize: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const serialized = announcements.map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    content: announcement.content,
    createdAt: announcement.createdAt.toISOString(),
    author: announcement.author,
    attachments: announcement.attachments,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF4E3] text-[#8A6D1D]">
          <Megaphone className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Annonces
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {canManage
              ? "Publie une annonce visible par toute l'organisation."
              : "Les annonces générales de ton organisation."}
          </p>
        </div>
      </div>

      {canManage && (
        <div className="mb-8 max-w-xl animate-fade-in-up stagger-1">
          <AnnouncementForm />
        </div>
      )}

      <AnnouncementsList initialAnnouncements={serialized} canManage={canManage} />
    </div>
  );
}
