import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole, handleAuthError, ForbiddenError } from "@/lib/session-guard";
import { MAX_CO_ADMINS, countCoAdmins, getPrimaryAdminId, requirePrimaryAdmin } from "@/lib/admins";
import { hashPassword } from "@/lib/password";
import { notifyUser } from "@/lib/notifications";

// ------------------------------------------------------------
// Équipe d'administration (voir AUDIT.md 7.22 et lib/admins.ts).
// GET  -> tout ORG_ADMIN voit l'équipe (principal + co-admins).
// POST -> ADMIN PRINCIPAL uniquement : ajoute un co-admin, soit en
//         promouvant un employé existant, soit en créant un compte neuf.
//         Avec replaceUserId, le co-admin indiqué est retiré (redevient
//         employé) dans la MÊME transaction : c'est le "remplacer".
// ------------------------------------------------------------

const passwordRule = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères")
  .regex(/[A-Z]/, "Ajoutez au moins une majuscule au mot de passe")
  .regex(/[0-9]/, "Ajoutez au moins un chiffre au mot de passe");

const addAdminSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("promote"),
    userId: z.string().min(1, "Choisissez un employé"),
    replaceUserId: z.string().optional(),
  }),
  z.object({
    mode: z.literal("create"),
    firstName: z.string().trim().min(1, "Entrez le prénom").max(50, "Prénom trop long"),
    lastName: z.string().trim().min(1, "Entrez le nom").max(50, "Nom trop long"),
    email: z.string().trim().email("Entrez une adresse courriel valide"),
    password: passwordRule,
    replaceUserId: z.string().optional(),
  }),
]);

const ADMIN_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  status: true,
  createdAt: true,
} as const;

export async function GET() {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);

    const primaryAdminId = await getPrimaryAdminId(ctx.organizationId);
    const admins = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, role: "ORG_ADMIN" },
      orderBy: { createdAt: "asc" },
      select: ADMIN_SELECT,
    });

    return Response.json({
      primaryAdminId,
      isPrimary: primaryAdminId === ctx.userId,
      maxCoAdmins: MAX_CO_ADMINS,
      admins: admins.map((a) => ({ ...a, isPrimary: a.id === primaryAdminId })),
    });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    requireRole(ctx, ["ORG_ADMIN"]);
    await requirePrimaryAdmin(ctx);

    const body = await request.json().catch(() => null);
    const parsed = addAdminSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Données invalides" },
        { status: 400 }
      );
    }
    const data = parsed.data;
    const primaryAdminId = ctx.userId; // requirePrimaryAdmin vient de le garantir

    // Co-admin à remplacer (optionnel) : doit être un co-admin de CETTE
    // organisation, jamais le principal lui-même.
    let replaced: { id: string; firstName: string; lastName: string } | null = null;
    if (data.replaceUserId) {
      if (data.replaceUserId === primaryAdminId) {
        throw new ForbiddenError("L'administrateur principal ne peut pas être remplacé");
      }
      replaced = await prisma.user.findFirst({
        where: { id: data.replaceUserId, organizationId: ctx.organizationId, role: "ORG_ADMIN" },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!replaced) {
        return Response.json({ error: "Co-admin à remplacer introuvable" }, { status: 404 });
      }
    }

    // Limite : MAX_CO_ADMINS places, une place libérée par le remplacement.
    const coAdmins = await countCoAdmins(ctx.organizationId, primaryAdminId);
    if (coAdmins - (replaced ? 1 : 0) >= MAX_CO_ADMINS) {
      return Response.json(
        {
          error: `Limite atteinte : ${MAX_CO_ADMINS} co-admins maximum. Retirez ou remplacez un co-admin existant.`,
        },
        { status: 409 }
      );
    }

    let newAdmin: { id: string; firstName: string; lastName: string };

    if (data.mode === "promote") {
      const candidate = await prisma.user.findFirst({
        where: { id: data.userId, organizationId: ctx.organizationId },
        select: { id: true, role: true, status: true, firstName: true, lastName: true },
      });
      if (!candidate) {
        return Response.json({ error: "Employé introuvable" }, { status: 404 });
      }
      if (candidate.role === "ORG_ADMIN" || candidate.role === "SUPER_ADMIN") {
        return Response.json({ error: "Cette personne est déjà administrateur" }, { status: 409 });
      }
      if (candidate.status !== "ACTIVE") {
        return Response.json(
          { error: "Ce compte est désactivé. Réactivez-le depuis la page Employés avant de le promouvoir." },
          { status: 409 }
        );
      }

      await prisma.$transaction(async (tx) => {
        if (replaced) await tx.user.update({ where: { id: replaced.id }, data: { role: "EMPLOYEE" } });
        await tx.user.update({ where: { id: candidate.id }, data: { role: "ORG_ADMIN" } });
      });
      newAdmin = candidate;
    } else {
      const email = data.email.toLowerCase().trim();
      const existing = await prisma.user.findUnique({
        where: { organizationId_email: { organizationId: ctx.organizationId, email } },
        select: { id: true },
      });
      if (existing) {
        return Response.json(
          {
            error:
              "Un compte existe déjà avec ce courriel dans l'organisation. Utilisez plutôt « Promouvoir un employé ».",
          },
          { status: 409 }
        );
      }

      const passwordHash = await hashPassword(data.password);
      const generalDepartment = await prisma.department.findUnique({
        where: { organizationId_name: { organizationId: ctx.organizationId, name: "Général" } },
        select: { id: true },
      });

      const created = await prisma.$transaction(async (tx) => {
        if (replaced) await tx.user.update({ where: { id: replaced.id }, data: { role: "EMPLOYEE" } });
        return tx.user.create({
          data: {
            organizationId: ctx.organizationId,
            departmentId: generalDepartment?.id ?? null,
            firstName: data.firstName,
            lastName: data.lastName,
            email,
            passwordHash,
            role: "ORG_ADMIN",
            status: "ACTIVE",
          },
          select: { id: true, firstName: true, lastName: true },
        });
      });
      newAdmin = created;
    }

    // Traçabilité : le remplacement = un retrait + un ajout, deux lignes.
    if (replaced) {
      await prisma.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "USER_ADMIN_REMOVED",
          targetId: replaced.id,
          metadata: { name: `${replaced.firstName} ${replaced.lastName}`, reason: "replaced" },
        },
      });
    }
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "USER_ADMIN_ADDED",
        targetId: newAdmin.id,
        metadata: { name: `${newAdmin.firstName} ${newAdmin.lastName}`, mode: data.mode },
      },
    });

    await notifyUser(ctx.organizationId, newAdmin.id, {
      type: "USER_ADMIN_ADDED",
      title: "Vous êtes maintenant administrateur",
      body: "L'administrateur principal vous a donné les droits d'administration.",
      link: "/dashboard",
    });

    return Response.json({ ok: true, adminId: newAdmin.id }, { status: 201 });
  } catch (error) {
    const authResponse = handleAuthError(error);
    if (authResponse) return authResponse;
    console.error(error);
    return Response.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
