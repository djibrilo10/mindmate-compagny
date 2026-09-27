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
const VALID_CATEGORIES = ["schedule", "policy", "other"] as const;

// POST /api/files -> un admin téléverse un ou plusieurs documents partagés
// (horaires, politiques, etc.), visibles par toute l'organisation. Fichiers
// stockés directement dans Postgres (voir FileUpload.data) : aucun service
// de stockage externe à configurer.
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ADMIN_ROLES); // étape 2 : réservé à l'admin

    const formData = await request.formData();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File);
    const categoryRaw = formData.get("category");
    const category = VALID_CATEGORIES.includes(categoryRaw as (typeof VALID_CATEGORIES)[number])
      ? (categoryRaw as (typeof VALID_CATEGORIES)[number])
      : "other";
    const weekLabelRaw = formData.get("weekLabel");
    const weekLabel = typeof weekLabelRaw === "string" && weekLabelRaw.trim() ? weekLabelRaw.trim() : null;

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
        mimeType: file.type,
        fileSize: file.size,
        data: Buffer.from(await file.arrayBuffer()),
      }))
    );

    const created = await prisma.$transaction(
      prepared.map((f) =>
        prisma.fileUpload.create({
          data: {
            organizationId: ctx.organizationId, // étape 3 : vient du token, jamais du client
            uploaderId: ctx.userId,
            category,
            weekLabel,
            ...f,
          },
          select: { id: true, fileName: true, mimeType: true, fileSize: true, category: true, weekLabel: true, createdAt: true },
        })
      )
    );

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "FILE_UPLOADED",
        metadata: { count: created.length, category },
      },
    });

    return Response.json({ files: created }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// GET /api/files -> n'importe quel employé connecté voit les documents
// partagés de son organisation (métadonnées seulement, jamais "data").
export async function GET() {
  try {
    const ctx = await requireAuth(); // étape 1

    const files = await prisma.fileUpload.findMany({
      where: { organizationId: ctx.organizationId }, // étape 3
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

    return Response.json({ files });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
