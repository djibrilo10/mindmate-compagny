"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { actionCategory } from "@/lib/activity-log";
import { CategoryIcon } from "@/components/dashboard/CategoryIcon";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

export function NotificationsList({ initialNotifications }: { initialNotifications: NotificationItem[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [markingAll, setMarkingAll] = useState(false);
  const router = useRouter();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  // Filet de sécurité : synchronise le badge de l'icône de l'app avec le
  // compte réel de non-lus dès que cette page est ouverte, même si une
  // notification push a été manquée (permission pas encore accordée,
  // appareil hors-ligne au moment de l'envoi, etc.). L'affichage "en direct"
  // du badge quand l'app est fermée reste géré par public/sw.js (push).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("setAppBadge" in navigator)) return;
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (unreadCount > 0) {
      nav.setAppBadge?.(unreadCount).catch(() => {});
    } else {
      nav.clearAppBadge?.().catch(() => {});
    }
  }, [unreadCount]);

  function openNotification(notification: NotificationItem) {
    if (!notification.isRead) {
      setNotifications((current) =>
        current.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n))
      );
      fetch(`/api/notifications/${notification.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      })
        .then(() => router.refresh()) // resynchronise le badge du clocher dans le Topbar
        .catch(() => {});
    }
    if (notification.link) router.push(notification.link);
  }

  async function markAllRead() {
    const previous = notifications;
    setMarkingAll(true);
    setNotifications((current) => current.map((n) => ({ ...n, isRead: true })));
    try {
      const response = await fetch("/api/notifications", { method: "POST" });
      if (!response.ok) throw new Error();
      router.refresh();
    } catch {
      // On annule le changement optimiste si la requête échoue côté serveur.
      setNotifications(previous);
    } finally {
      setMarkingAll(false);
    }
  }

  if (notifications.length === 0) {
    return (
      <div className="animate-fade-in-up stagger-1 flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E4E9] bg-white px-6 py-14 text-center">
        <Bell className="h-6 w-6 text-[#B7BECC]" strokeWidth={1.6} />
        <p className="text-sm text-[#5B6478]">Aucune notification pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up stagger-1">
      {unreadCount > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={markAllRead}
            disabled={markingAll}
            className="text-xs font-medium text-[#2F6F5E] hover:underline disabled:opacity-50"
          >
            Tout marquer comme lu
          </button>
        </div>
      )}
      <div className="space-y-2">
        {notifications.map((notification) => (
          <button
            key={notification.id}
            onClick={() => openNotification(notification)}
            className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left shadow-sm transition-all hover:shadow-md ${
              notification.isRead ? "border-[#E2E4E9] bg-white" : "border-[#2F6F5E]/30 bg-[#E7F3EF]/40"
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#5B6478] shadow-sm">
              <CategoryIcon category={actionCategory(notification.type)} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-[#1C2438]">{notification.title}</p>
                {!notification.isRead && (
                  <span className="h-2 w-2 shrink-0 rounded-full bg-[#8A3B3B]" aria-label="Non lu" />
                )}
              </div>
              {notification.body && (
                <p className="mt-0.5 truncate text-sm text-[#5B6478]">{notification.body}</p>
              )}
              <p className="mt-1 text-xs text-[#9AA1B2]">
                {new Date(notification.createdAt).toLocaleString("fr-CA", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
