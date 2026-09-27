import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import type { Role } from "@prisma/client";

// ------------------------------------------------------------
// Création des notifications (Phase 4). À appeler juste après l'écriture
// dans AuditLog dans chaque route qui déclenche un événement notifiable —
// même "type" que l'action AuditLog correspondante, pour réutiliser
// actionCategory()/CATEGORY_ICONS de lib/activity-log.ts côté affichage.
//
// Volontairement séparé d'AuditLog : une notification cible UN utilisateur
// précis (userId) et représente un état lu/non lu pour LUI, alors
// qu'AuditLog trace toutes les actions de l'organisation pour l'admin.
// ------------------------------------------------------------

type NotifyContent = {
  type: string; // même valeur qu'une action AuditLog, ex: "REPORT_CREATED"
  title: string;
  body?: string;
  link?: string;
};

export async function notifyUser(organizationId: string, userId: string, content: NotifyContent) {
  await prisma.notification.create({
    data: { organizationId, userId, ...content },
  });
  await pushOne(userId, content);
}

export async function notifyUsers(organizationId: string, userIds: string[], content: NotifyContent) {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({ organizationId, userId, ...content })),
  });
  await Promise.all(userIds.map((userId) => pushOne(userId, content)));
}

// Envoie la vraie notification système (push) après coup, une fois la ligne
// Notification déjà écrite en base -- le badge de l'icône de l'app reflète
// le compte RÉEL de non-lus, pas juste "+1" (au cas où plusieurs
// notifications arrivent d'un coup). Ne fait jamais échouer l'appelant :
// le push est un bonus, la table Notification reste la source de vérité.
async function pushOne(userId: string, content: NotifyContent) {
  try {
    const unreadCount = await prisma.notification.count({ where: { userId, isRead: false } });
    await sendPushToUser(userId, {
      title: content.title,
      body: content.body,
      link: content.link,
      badgeCount: unreadCount,
    });
  } catch (error) {
    console.error("[notifications] push non envoyé", error);
  }
}

// Notifie tous les utilisateurs ACTIFS de l'organisation ayant l'un des
// rôles donnés (ex. prévenir les admins/gérants d'un nouveau signalement).
// excludeUserId évite de notifier l'auteur de l'action lui-même.
export async function notifyRoles(
  organizationId: string,
  roles: Role[],
  content: NotifyContent,
  excludeUserId?: string
) {
  const recipients = await prisma.user.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      role: { in: roles },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  await notifyUsers(organizationId, recipients.map((r) => r.id), content);
}

// Notifie TOUS les employés actifs de l'organisation (ex. nouvelle annonce).
export async function notifyOrganization(
  organizationId: string,
  content: NotifyContent,
  excludeUserId?: string
) {
  const recipients = await prisma.user.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  await notifyUsers(organizationId, recipients.map((r) => r.id), content);
}
