import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { MAX_LOGO_SIZE, formatFileSize, isAllowedLogoType } from "@/lib/attachments";
import type { Role } from "@prisma/client";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];

// ------------------------------------------------------------
// Logo propre à CHAQUE organisation (voir AUDIT.md 7.19) : contrairement au
// logo "Mindmate Compagny" affiché sur les pages (auth) avant connexion
// (personne ne sait encore de quelle organisation il s'agit), celui-ci
// s'affiche à TOUS les employés d'une organisation une fois connectés
// (DashboardShell.tsx). Stocké directement dans Postgres, même pattern que
// les documents/pièces jointes (5.5) — pas de service de stockage externe.
// ------------------------------------------------------------

// GET -> n'importe quel employé connecté (le logo s'affiche dans la barre
// latérale pour tout le monde, pas seulement l'admin). Si l'organisation
// n'a pas encore de logo personnalisé, on redirige vers le logo par défaut
// de la plateforme plutôt que de renvoyer une erreur.
export async function GET(request: Request) {
  try {
    const ctx = await requireAuth();

    const organization = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { logoData: true, logoMimeType: true },
    });

    if (!organization?.logoData || !organization.logoMimeType) {
      return NextResponse.redirect(new URL("/logo-mark-white.png", request.url));
    }

    return new Response(new Uint8Array(organization.logoData), {
      headers: {
        "Content-Type": organization.logoMimeType,
        "Content-Length": String(organization.logoData.length),
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

// POST -> un admin téléverse le logo de son organisation (remplace l'ancien
// s'il y en avait déjà un). Un seul fichier, champ "logo".
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ADMIN_ROLES);

    const formData = await request.formData();
    const file = formData.get("logo");

    if (!(file instanceof File)) {
      return Response.json({ error: "Aucune image reçue" }, { status: 400 });
    }
    if (!isAllowedLogoType(file.type)) {
      return Response.json(
        { error: "Type d'image non autorisé. Formats acceptés : PNG, JPG, WEBP." },
        { status: 400 }
      );
    }
    if (file.size > MAX_LOGO_SIZE) {
      return Response.json(
        { error: `L'image dépasse la limite de ${formatFileSize(MAX_LOGO_SIZE)} (${formatFileSize(file.size)} envoyés).` },
        { status: 400 }
      );
    }

    const data = Buffer.from(await file.arrayBuffer());

    await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: {
        logoData: data,
        logoMimeType: file.type,
        logoUpdatedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ORGANIZATION_LOGO_UPDATED",
      },
    });

    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE -> un admin retire le logo personnalisé (retour au logo par défaut
// de la plateforme, voir GET ci-dessus).
export async function DELETE() {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ADMIN_ROLES);

    await prisma.organization.update({
      where: { id: ctx.organizationId },
      data: {
        logoData: null,
        logoMimeType: null,
        logoUpdatedAt: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "ORGANIZATION_LOGO_REMOVED",
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
