import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth, UnauthorizedError } from "@/lib/session-guard";
import { NotificationsList } from "@/components/dashboard/NotificationsList";
import { PushNotificationsToggle } from "@/components/dashboard/PushNotificationsToggle";

const MAX_NOTIFICATIONS = 50;

export default async function NotificationsPage() {
  let ctx;
  try {
    ctx = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }

  // Toujours filtré par userId ET organizationId : personne ne voit les
  // notifications d'un autre, même dans la même organisation.
  const notifications = await prisma.notification.findMany({
    where: { organizationId: ctx.organizationId, userId: ctx.userId },
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
    <div>
      <div className="mb-6 flex items-center gap-3 animate-fade-in-up">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E7F0FA] text-[#2A5A8A]">
          <Bell className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-[#1C2438]">
            Notifications
          </h1>
          <p className="mt-0.5 text-sm text-[#5B6478]">
            Les {MAX_NOTIFICATIONS} dernières notifications qui te concernent.
          </p>
        </div>
      </div>

      <PushNotificationsToggle />
      <NotificationsList initialNotifications={serialized} />
    </div>
  );
}
