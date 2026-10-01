import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import type { Role } from "@prisma/client";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { createTranslator, type TFunction, type Translator } from "@/lib/i18n/translator";
import { dictionaries } from "@/lib/i18n/dictionaries";

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
      // Jamais le propriétaire de la plateforme, même si SUPER_ADMIN figure
      // dans la liste des rôles (7.24) : il a son propre canal, /platform/support.
      role: { in: roles.filter((r) => r !== "SUPER_ADMIN") },
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
      role: { not: "SUPER_ADMIN" }, // voir notifyRoles ci-dessus (7.24)
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  await notifyUsers(organizationId, recipients.map((r) => r.id), content);
}

// ------------------------------------------------------------
// Notification dans la LANGUE de chaque destinataire (FR/EN, AUDIT.md 7.29) :
// les textes sont enregistrés en base au moment de l'envoi, donc on les
// rédige une fois par langue (User.locale, sinon langue de l'entreprise).
//   await notifyUsersLocalized(orgId, ids, (t) => ({ type, title: t("..."), ... }))
// ------------------------------------------------------------
export async function notifyUsersLocalized(
  organizationId: string,
  userIds: string[],
  build: (t: TFunction, translator: Translator) => NotifyContent
) {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return;
  const [users, organization] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids }, organizationId }, select: { id: true, locale: true } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { defaultLocale: true } }),
  ]);
  const orgLocale: Locale = isLocale(organization?.defaultLocale) ? organization.defaultLocale : DEFAULT_LOCALE;
  const byLocale = new Map<Locale, string[]>();
  for (const u of users) {
    const locale = isLocale(u.locale) ? u.locale : orgLocale;
    byLocale.set(locale, [...(byLocale.get(locale) ?? []), u.id]);
  }
  for (const [locale, localeIds] of byLocale) {
    const translator = createTranslator(locale, dictionaries[locale]);
    await notifyUsers(organizationId, localeIds, build(translator.t, translator));
  }
}
