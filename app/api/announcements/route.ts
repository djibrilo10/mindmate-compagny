import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { notifyOrganization } from "@/lib/notifications";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

// POST /api/announcements -> un admin publie une annonce visible par toute l'organisation
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth(); // étape 1
    requireRole(ctx, ADMIN_ROLES); // étape 2 : réservé à l'admin (pas au gérant)

    const body = await request.json();
    const { title, content } = body;

    if (!title?.trim() || !content?.trim()) {
      return Response.json({ error: "Titre et contenu requis" }, { status: 400 });
    }

    const announcement = await prisma.announcement.create({
      data: {
        organizationId: ctx.organizationId, // étape 3 : vient du token, jamais du client
        authorId: ctx.userId,
        title: title.trim(),
        content: content.trim(),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ANNOUNCEMENT_CREATED",
        targetId: announcement.id,
      },
    });

    // Diffusion à toute l'organisation (comme la page Annonces elle-même).
    await notifyOrganization(ctx.organizationId, {
      type: "ANNOUNCEMENT_CREATED",
      title: "Nouvelle annonce",
      body: title.trim(),
      link: "/dashboard/announcements",
    }, ctx.userId);

    return Response.json({ announcement }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// GET /api/announcements -> tous les employés connectés de l'organisation les voient
export async function GET() {
  try {
    const ctx = await requireAuth();

    const announcements = await prisma.announcement.findMany({
      where: { organizationId: ctx.organizationId }, // étape 3 : filtre tenant obligatoire
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { firstName: true, lastName: true } },
        // On ne renvoie jamais "data" (le contenu binaire) dans la liste :
        // seulement ce qu'il faut pour afficher un lien de téléchargement.
        attachments: {
          select: { id: true, fileName: true, fileType: true, fileSize: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return Response.json({ announcements });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
