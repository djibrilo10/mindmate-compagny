import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

// GET /api/announcements/[id]/attachments/[attachmentId] -> n'importe quel
// employé connecté de l'organisation peut consulter/télécharger le fichier
// (la liste des annonces est déjà visible par tous, voir /api/announcements).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const ctx = await requireAuth(); // étape 1
    const { id: announcementId, attachmentId } = await params;

    // étape 3 : where combine l'id ET organizationId ET announcementId,
    // impossible de récupérer le fichier d'une autre organisation ou
    // d'une autre annonce même en devinant l'id.
    const attachment = await prisma.announcementAttachment.findFirst({
      where: { id: attachmentId, announcementId, organizationId: ctx.organizationId },
    });
    if (!attachment) {
      return Response.json({ error: "Fichier introuvable" }, { status: 404 });
    }

    const encodedName = encodeURIComponent(attachment.fileName);

    return new Response(new Uint8Array(attachment.data), {
      headers: {
        "Content-Type": attachment.fileType,
        "Content-Length": String(attachment.fileSize),
        // "inline" pour que le navigateur affiche le PDF/l'image directement
        // au lieu de forcer un téléchargement.
        "Content-Disposition": `inline; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/announcements/[id]/attachments/[attachmentId] -> un admin
// retire un fichier précis sans supprimer toute l'annonce.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ADMIN_ROLES); // étape 2 : réservé à l'admin

    const { id: announcementId, attachmentId } = await params;

    const result = await prisma.announcementAttachment.deleteMany({
      where: { id: attachmentId, announcementId, organizationId: ctx.organizationId },
    });
    if (result.count === 0) {
      return Response.json({ error: "Fichier introuvable" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ANNOUNCEMENT_ATTACHMENT_DELETED",
        targetId: attachmentId,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
