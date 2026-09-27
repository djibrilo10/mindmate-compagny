import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { FileUploadForm } from "@/components/dashboard/FileUploadForm";
import { FilesList } from "@/components/dashboard/FilesList";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

export default async function FilesPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const canManage = ADMIN_ROLES.includes(ctx.role);

  // Tout le monde voit les documents de son organisation, mais seul un admin
  // peut en téléverser ou en retirer (voir ADMIN_ROLES dans l'API).
  const files = await prisma.fileUpload.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      fileSize: true,
      category: true,
      weekLabel: true,
      createdAt: true,
      uploader: { select: { firstName: true, lastName: true } },
    },
  });

  const serialized = files.map((file) => ({
    ...file,
    createdAt: file.createdAt.toISOString(),
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF1F5] text-[#5B6478]">
          <FileText className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Documents
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            {canManage
              ? "Téléverse un document partagé avec toute l'organisation."
              : "Les documents partagés par ton organisation."}
          </p>
        </div>
      </div>

      {canManage && (
        <div className="mb-8 max-w-xl animate-fade-in-up stagger-1">
          <FileUploadForm />
        </div>
      )}

      <FilesList initialFiles={serialized} canManage={canManage} />
    </div>
  );
}
