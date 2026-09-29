import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { NotificationsList } from "@/components/dashboard/NotificationsList";
import { PushNotificationsToggle } from "@/components/dashboard/PushNotificationsToggle";

// ------------------------------------------------------------
// Notifications du propriétaire de la plateforme (voir AUDIT.md 7.25).
// Réutilise EXACTEMENT les mêmes composants que /dashboard/notifications :
// même bouton d'activation du push (donc même notification système, même
// son que pour les employés), même liste lu/non lu. Garde SUPER_ADMIN posée
// dans app/platform/layout.tsx + middleware.ts.
// ------------------------------------------------------------

const MAX_NOTIFICATIONS = 50;

export default async function PlatformNotificationsPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  const notifications = await prisma.notification.findMany({
    // Seulement les notifications propres à la console (messages d'assistance).
    // Filtre volontaire : avant 7.24, notifyRoles() envoyait aussi au compte
    // SUPER_ADMIN les signalements/sondages de sa propre organisation ; ces
    // anciennes lignes restent en base mais n'ont rien à faire ici.
    where: { userId: ctx.userId, type: "SUPPORT_MESSAGE" },
    orderBy: { createdAt: "desc" },
    take: MAX_NOTIFICATIONS,
  });

  const serialized = notifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F0FA] text-[#2A5A8A]">
          <Bell className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">Notifications</h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            Messages des admins principaux. Active les alertes sur chaque appareil où tu veux les recevoir.
          </p>
        </div>
      </div>

      <PushNotificationsToggle />
      <NotificationsList initialNotifications={serialized} />
    </div>
  );
}
