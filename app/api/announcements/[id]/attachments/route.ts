import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import {
  MAX_TOTAL_ATTACHMENTS_SIZE,
  MAX_ATTACHMENTS_PER_UPLOAD,
  formatFileSize,
  isAllowedAttachmentType,
} from "@/lib/attachments";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

// POST /api/announcements/[id]/attachments -> un admin joint un ou plusieurs
// fichiers (PDF, JPG, PNG, WEBP) à une annonce déjà créée. Les fichiers sont
// stockés directement dans Postgres (voir AnnouncementAttachment.data) :
// aucun service de stockage externe à configurer.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ADMIN_ROLES); // étape 2 : réservé à l'admin

    const { id: announcementId } = await params;

    // étape 3 : l'annonce doit appartenir à l'organisation de l'admin.
    const announcement = await prisma.announcement.findFirst({
      where: { id: announcementId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!announcement) {
      return Response.json({ error: "Annonce introuvable" }, { status: 404 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return Response.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }
    if (files.length > MAX_ATTACHMENTS_PER_UPLOAD) {
      return Response.json(
        { error: `Maximum ${MAX_ATTACHMENTS_PER_UPLOAD} fichiers à la fois` },
        { status: 400 }
      );
    }
    for (const file of files) {
      if (!isAllowedAttachmentType(file.type)) {
        return Response.json(
          {
            error: `Type de fichier non autorisé : "${file.name}". Formats acceptés : PDF, JPG, PNG, WEBP.`,
          },
          { status: 400 }
        );
      }
    }

    // Limite sur le TOTAL des fichiers de cet envoi (pas fichier par fichier) :
    // c'est la taille combinée de la requête qui compte pour Vercel.
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_ATTACHMENTS_SIZE) {
      return Response.json(
        {
          error: `Ces fichiers dépassent la limite de ${formatFileSize(MAX_TOTAL_ATTACHMENTS_SIZE)} au total (${formatFileSize(totalSize)} sélectionnés). Envoie-les en plusieurs fois.`,
        },
        { status: 400 }
      );
    }

    // On lit tous les octets AVANT d'écrire en base, pour ne créer aucune
    // ligne partielle si un fichier pose problème en cours de lecture.
    const prepared = await Promise.all(
      files.map(async (file) => ({
        fileName: file.name.slice(0, 200),
        fileType: file.type,
        fileSize: file.size,
        data: Buffer.from(await file.arrayBuffer()),
      }))
    );

    const created = await prisma.$transaction(
      prepared.map((f) =>
        prisma.announcementAttachment.create({
          data: { organizationId: ctx.organizationId, announcementId, ...f },
          select: { id: true, fileName: true, fileType: true, fileSize: true },
        })
      )
    );

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ANNOUNCEMENT_ATTACHMENT_ADDED",
        targetId: announcementId,
        metadata: { count: created.length },
      },
    });

    return Response.json({ attachments: created }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
