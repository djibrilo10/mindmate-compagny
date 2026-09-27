import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError } from "@/lib/session-guard";
import { notifyRoles } from "@/lib/notifications";

// ============================================================
// CETTE ROUTE EST LE MODÈLE À COPIER pour toutes vos futures
// routes API (absences, annonces, fichiers, etc.)
//
// Pattern en 3 étapes, TOUJOURS dans cet ordre :
//   1. requireAuth()   -> qui es-tu ? (organizationId vient d'ICI, pas du client)
//   2. requireRole()   -> as-tu le droit de faire ça ?
//   3. Requête Prisma  -> TOUJOURS filtrée par organizationId
// ============================================================

// POST /api/reports -> un employé signale un problème
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth(); // étape 1 : n'importe quel utilisateur connecté peut signaler

    const body = await request.json();
    const { title, description, isAnonymous } = body;

    if (!title?.trim() || !description?.trim()) {
      return Response.json({ error: "Titre et description requis" }, { status: 400 });
    }

    const report = await prisma.report.create({
      data: {
        organizationId: ctx.organizationId, // <-- vient du TOKEN, jamais du body envoyé par le client
        submitterId: ctx.userId,
        title: title.trim(),
        description: description.trim(),
        isAnonymous: Boolean(isAnonymous),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "REPORT_CREATED",
        targetId: report.id,
      },
    });

    // Prévenir les admins/gérants qu'un nouveau signalement attend leur attention.
    await notifyRoles(ctx.organizationId, ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"], {
      type: "REPORT_CREATED",
      title: "Nouveau signalement",
      body: title.trim(),
      link: "/dashboard/reports",
    }, ctx.userId);

    return Response.json({ report }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// GET /api/reports -> uniquement les managers/admins peuvent voir les signalements
export async function GET() {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN", "MANAGER", "SUPER_ADMIN"]); // étape 2 : contrôle du rôle

    const reports = await prisma.report.findMany({
      where: { organizationId: ctx.organizationId }, // étape 3 : filtre tenant obligatoire
      orderBy: { createdAt: "desc" },
      include: {
        submitter: {
          select: { firstName: true, lastName: true, departmentId: true },
        },
      },
    });

    // Si le signalement est anonyme, on masque l'identité même pour l'admin
    // qui consulte la liste (idée additionnelle : vraie confidentialité)
    const sanitized = reports.map((r) =>
      r.isAnonymous
        ? { ...r, submitter: null, submitterId: null }
        : r
    );

    return Response.json({ reports: sanitized });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
