"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Undo2 } from "lucide-react";

// Annuler un départ enregistré par erreur (ou l'employé reste). AUDIT.md 7.26.
export function CancelDepartureButton({ departureId }: { departureId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/departures/${departureId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Échec");
      router.push("/dashboard/retention");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <button
            type="button"
            onClick={cancel}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#C2542C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#A8451F] disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin" />} Confirmer l&apos;annulation (réponses supprimées)
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="text-xs text-[#5B6478]">
            Garder
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#DADEE5] px-3 py-1.5 text-xs font-medium text-[#1C2438] hover:border-[#C2542C] hover:text-[#C2542C]"
        >
          <Undo2 className="h-3.5 w-3.5" /> Annuler ce départ
        </button>
      )}
      {error && <span className="text-xs text-[#8A3B3B]">{error}</span>}
    </div>
  );
}
