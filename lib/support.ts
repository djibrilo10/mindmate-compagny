import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notifications";

// ------------------------------------------------------------
// Support privé : admin principal -> propriétaire de la plateforme
// (voir AUDIT.md 7.24).
// ------------------------------------------------------------

// Nom affiché aux admins des organisations clientes. Le compte SUPER_ADMIN
// lui-même (nom, courriel, id) n'est JAMAIS envoyé au navigateur d'un admin.
export const PLATFORM_CONTACT_NAME = "Djibril";
export const PLATFORM_BRAND = "Mindmate Compagny";

// Garde-fou anti-abus : nombre maximum de NOUVELLES demandes par
// organisation sur 24 h (les réponses dans une demande existante ne comptent pas).
export const MAX_NEW_TICKETS_PER_DAY = 5;

export const newTicketSchema = z.object({
  subject: z.string().trim().min(3, "Le sujet doit contenir au moins 3 caractères").max(120, "Sujet trop long"),
  message: z.string().trim().min(5, "Décris le problème en quelques mots").max(4000, "Message trop long (4000 caractères max)"),
});

export const replySchema = z.object({
  message: z.string().trim().min(1, "Message vide").max(4000, "Message trop long (4000 caractères max)"),
});

/** Prévient le(s) propriétaire(s) de la plateforme (notification en app + push). */
export async function notifyPlatformOwners(content: { title: string; body?: string; link: string }) {
  const owners = await prisma.user.findMany({
    where: { role: "SUPER_ADMIN", status: "ACTIVE" },
    select: { id: true, organizationId: true },
  });
  await Promise.all(
    owners.map((owner) =>
      notifyUser(owner.organizationId, owner.id, { type: "SUPPORT_MESSAGE", ...content }).catch((e) =>
        console.error("[support] notification propriétaire non envoyée", e)
      )
    )
  );
}
