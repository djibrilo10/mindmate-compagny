import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

// GET /api/files/[id] -> n'importe quel employé connecté de l'organisation
// peut consulter/télécharger le document (la liste est déjà visible par
// tous, voir GET /api/files).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(); // étape 1
    const { id } = await params;

    // étape 3 : where combine l'id ET organizationId, impossible de
    // récupérer le fichier d'une autre organisation même en devinant l'id.
    const file = await prisma.fileUpload.findFirst({
      where: { id, organizationId: ctx.organizationId },
    });
    if (!file) {
      return Response.json({ error: "Fichier introuvable" }, { status: 404 });
    }

    const encodedName = encodeURIComponent(file.fileName);

    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.fileSize),
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

// DELETE /api/files/[id] -> un admin retire un document partagé.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ADMIN_ROLES); // étape 2 : réservé à l'admin
    const { id } = await params;

    const result = await prisma.fileUpload.deleteMany({
      where: { id, organizationId: ctx.organizationId },
    });
    if (result.count === 0) {
      return Response.json({ error: "Fichier introuvable" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "FILE_DELETED",
        targetId: id,
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
