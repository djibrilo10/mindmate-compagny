"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";

// Bouton « Marquer comme traitée » d'une demande de démo (AUDIT.md 7.43).
export function DemoRequestHandledButton({ id, handled }: { id: string; handled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/platform/demo-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handled: !handled }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
          handled ? "border border-[#E2E4E9] bg-white text-[#5B6478] hover:bg-[#F7F8FA]" : "bg-[#2F6F5E] text-white hover:bg-[#275D4F]"
        }`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : handled ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        {handled ? "Remettre à traiter" : "Marquer comme traitée"}
      </button>
      {error && <span className="text-xs text-[#8A3B3B]">Échec, réessaie.</span>}
    </div>
  );
}
