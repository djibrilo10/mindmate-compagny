"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { subscribeToPush, unsubscribeFromPush, getPushSubscriptionStatus } from "@/lib/push-client";

type Status = "loading" | "subscribed" | "unsubscribed" | "unsupported" | "denied";

// Bouton "Activer/Désactiver les notifications" -- placé en haut de la page
// Notifications (voir app/dashboard/notifications/page.tsx). Chaque
// appareil/navigateur a son propre abonnement (voir lib/push-client.ts),
// donc ce statut est propre à CET appareil, pas au compte en général.
export function PushNotificationsToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    getPushSubscriptionStatus().then((subscribed) => {
      if (subscribed) setStatus("subscribed");
      else if (Notification.permission === "denied") setStatus("denied");
      else setStatus("unsubscribed");
    });
  }, []);

  async function handleEnable() {
    setBusy(true);
    const result = await subscribeToPush();
    setStatus(result);
    setBusy(false);
  }

  async function handleDisable() {
    setBusy(true);
    await unsubscribeFromPush();
    setStatus("unsubscribed");
    setBusy(false);
  }

  if (status === "loading" || status === "unsupported") return null;

  if (status === "denied") {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#E2E4E9] bg-white px-4 py-3 text-sm text-[#5B6478]">
        <BellOff className="h-4 w-4 shrink-0" strokeWidth={1.8} />
        <span>
          Notifications bloquées pour ce site — active-les dans les réglages de ton navigateur
          pour les recevoir ici.
        </span>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#E2E4E9] bg-white px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-[#1C2438]">
        {status === "subscribed" ? (
          <BellRing className="h-4 w-4 shrink-0 text-[#2F6F5E]" strokeWidth={1.8} />
        ) : (
          <Bell className="h-4 w-4 shrink-0 text-[#9AA1B2]" strokeWidth={1.8} />
        )}
        <span>
          {status === "subscribed"
            ? "Notifications activées sur cet appareil"
            : "Reçois une alerte même quand l'app est fermée"}
        </span>
      </div>
      <button
        onClick={status === "subscribed" ? handleDisable : handleEnable}
        disabled={busy}
        className="shrink-0 rounded-md border border-[#DADEE5] px-3 py-1.5 text-xs font-medium text-[#1C2438] transition-colors hover:border-[#2F6F5E] hover:text-[#2F6F5E] disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
        ) : status === "subscribed" ? (
          "Désactiver"
        ) : (
          "Activer"
        )}
      </button>
    </div>
  );
}
