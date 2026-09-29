import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { History } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { VISIBLE_USER } from "@/lib/visibility";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { ActivityLogList } from "@/components/dashboard/ActivityLogList";

const ADMIN_ROLES: Role[] = ["ORG_ADMIN", "SUPER_ADMIN"];
const MAX_ENTRIES = 250;

export default async function ActivityPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  // Page réservée à l'admin : contrairement aux autres pages (où tout le
  // monde voit une partie du contenu), ce journal touche des actions de
  // tous les employés — il n'a pas sa place hors de l'administration.
  if (!ADMIN_ROLES.includes(ctx.role)) {
    redirect("/dashboard");
  }

  // AuditLog n'a qu'un champ scalaire "actorId" (pas de relation Prisma vers
  // User) : on résout les noms nous-mêmes, via une seule requête groupée,
  // plutôt que d'utiliser include/relation (qui n'existe pas sur ce modèle).
  const logs = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: MAX_ENTRIES,
    select: {
      id: true,
      action: true,
      actorId: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });

  // On rassemble TOUS les ids d'utilisateurs dont on aura besoin pour
  // afficher un nom : l'auteur de chaque action, plus quelques cas où le
  // "target" est aussi un utilisateur (destinataire d'un message, compte
  // activé/désactivé) — une seule requête groupée plutôt qu'une par ligne.
  const relatedUserIds = new Set<string>();
  for (const log of logs) {
    if (log.actorId) relatedUserIds.add(log.actorId);
    if (log.action === "MESSAGE_SENT" && log.metadata && typeof log.metadata === "object") {
      const receiverId = (log.metadata as Record<string, unknown>).receiverId;
      if (typeof receiverId === "string") relatedUserIds.add(receiverId);
    }
    if ((log.action === "USER_DISABLED" || log.action === "USER_REACTIVATED") && log.targetId) {
      relatedUserIds.add(log.targetId);
    }
  }

  const relatedUsers = relatedUserIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(relatedUserIds) }, organizationId: ctx.organizationId, ...VISIBLE_USER },
        select: { id: true, firstName: true, lastName: true, role: true },
      })
    : [];
  const relatedUserById = new Map(relatedUsers.map((u) => [u.id, u]));

  const serialized = logs.map((log) => {
    let targetName: string | null = null;
    if (log.action === "MESSAGE_SENT" && log.metadata && typeof log.metadata === "object") {
      const receiverId = (log.metadata as Record<string, unknown>).receiverId;
      if (typeof receiverId === "string") {
        const receiver = relatedUserById.get(receiverId);
        targetName = receiver ? `${receiver.firstName} ${receiver.lastName}` : null;
      }
    }
    if ((log.action === "USER_DISABLED" || log.action === "USER_REACTIVATED") && log.targetId) {
      const target = relatedUserById.get(log.targetId);
      targetName = target ? `${target.firstName} ${target.lastName}` : null;
    }

    const actorUser = log.actorId ? relatedUserById.get(log.actorId) : undefined;

    return {
      id: log.id,
      action: log.action,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
      actor: actorUser
        ? {
            id: actorUser.id,
            firstName: actorUser.firstName,
            lastName: actorUser.lastName,
            role: actorUser.role,
          }
        : null,
      targetName,
    };
  });

  return (
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF1F5] text-[#5B6478]">
          <History className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Historique d&apos;activité
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            Les {MAX_ENTRIES} dernières actions de ton organisation — annonces, documents, postes,
            signalements, absences, messages, avis et comptes employés.
          </p>
        </div>
      </div>

      <ActivityLogList entries={serialized} />
    </div>
  );
}
