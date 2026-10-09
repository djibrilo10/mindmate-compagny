"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, CheckCircle2, Clock3, Hand, Loader2, Repeat2, User, Users, X } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Portal } from "@/components/ui/Portal";

// ------------------------------------------------------------
// Échanges de quart (AUDIT.md 7.42), côté écran :
// - GiveShiftButton : « Je ne peux pas venir » sur un quart de l'employé ;
// - SwapOffers      : quarts que les collègues proposent (« Je le prends ») ;
// - SwapApprovals   : responsables / admin, « Approuver » ou « Refuser ».
// ------------------------------------------------------------

export type Colleague = { id: string; name: string; sameTeam: boolean };

export type MySwap = {
  id: string;
  status: "OPEN" | "ACCEPTED";
  targetName: string | null;
  takerName: string | null;
};

export type SwapOffer = {
  id: string;
  dateLabel: string;
  time: string;
  position: string;
  fromName: string;
  toYou: boolean;
  status: "OPEN" | "ACCEPTED";
};

export type SwapApproval = {
  id: string;
  dateLabel: string;
  time: string;
  position: string;
  fromName: string;
  takerName: string;
  note: string;
};

type Feedback = { ok: boolean; text: string } | null;

function useSwapAction() {
  const router = useRouter();
  const { t, tx } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function run(key: string, url: string, method: string, body: unknown, success: string) {
    setBusy(key);
    setFeedback(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ? tx(data.error) : t("common.operationFailed"));
      setFeedback({ ok: true, text: success });
      router.refresh();
      return true;
    } catch (e) {
      setFeedback({ ok: false, text: e instanceof Error ? e.message : t("common.unknownError") });
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { busy, feedback, setFeedback, run };
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.ok ? "status" : "alert"}
      className={`mt-2 flex items-start gap-1.5 text-sm ${feedback.ok ? "text-[#2F6F5E]" : "text-[#8A3B3B]"}`}
    >
      {feedback.ok && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      {feedback.text}
    </p>
  );
}

// ---------- « Je ne peux pas venir » ----------

export function GiveShiftButton({
  shiftId,
  dateLabel,
  time,
  colleagues,
  swap,
}: {
  shiftId: string;
  dateLabel: string;
  time: string;
  colleagues: Colleague[];
  swap: MySwap | null;
}) {
  const { t } = useI18n();
  const { busy, feedback, setFeedback, run } = useSwapAction();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"team" | "person">("team");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");

  const team = colleagues.filter((c) => c.sameTeam);
  const others = colleagues.filter((c) => !c.sameTeam);

  if (swap) {
    const label =
      swap.status === "ACCEPTED"
        ? t("schedule.swap.statusAccepted", { name: swap.takerName ?? "" })
        : swap.targetName
          ? t("schedule.swap.statusOpenPerson", { name: swap.targetName })
          : t("schedule.swap.statusOpenTeam");
    return (
      <div className="mt-2">
        <p className="inline-flex items-center gap-1.5 rounded-md bg-[#FFF4E0] px-2 py-1 text-xs font-medium text-[#8A5A12]">
          <Repeat2 className="h-3.5 w-3.5" /> {label}
        </p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (!window.confirm(t("schedule.swap.confirmCancel"))) return;
            run("cancel", `/api/shift-swaps/${swap.id}`, "PATCH", { action: "cancel" }, t("schedule.swap.done.cancelled"));
          }}
          className="ml-2 text-xs font-medium text-[#8A3B3B] underline underline-offset-2 disabled:opacity-50"
        >
          {busy === "cancel" ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : t("schedule.swap.cancel")}
        </button>
        <FeedbackLine feedback={feedback} />
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode === "person" && !target) {
      setFeedback({ ok: false, text: t("schedule.swap.errors.targetInvalid") });
      return;
    }
    const ok = await run(
      "give",
      "/api/shift-swaps",
      "POST",
      { shiftId, targetUserId: mode === "person" ? target : "", note },
      t("schedule.swap.done.offered")
    );
    if (ok) setOpen(false);
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => {
          setFeedback(null);
          setMode("team");
          setTarget("");
          setNote("");
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E4E9] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C2438] hover:bg-[#F7F8FA]"
      >
        <ArrowRightLeft className="h-3.5 w-3.5 text-[#2F6F5E]" /> {t("schedule.swap.give")}
      </button>
      {!open && <FeedbackLine feedback={feedback} />}

      {open && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1C2438]/40 p-4 sm:items-center" onClick={() => busy === null && setOpen(false)}>
            <form
              onSubmit={submit}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-md animate-scale-in overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#1C2438]">{t("schedule.swap.dialogTitle")}</h2>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[#5B6478]">
                    <Clock3 className="h-4 w-4 text-[#2F6F5E]" />
                    <span className="capitalize">{dateLabel}</span> · {time}
                  </p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label={t("common.close")} className="rounded-md p-1 text-[#5B6478] hover:bg-[#F7F8FA]">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <fieldset className="mt-4 space-y-2">
                <legend className="mb-2 text-sm font-medium text-[#1C2438]">{t("schedule.swap.toWhom")}</legend>
                {(
                  [
                    { value: "team", icon: Users, label: t("schedule.swap.toTeam"), help: t("schedule.swap.toTeamHelp") },
                    { value: "person", icon: User, label: t("schedule.swap.toPerson"), help: t("schedule.swap.toPersonHelp") },
                  ] as const
                ).map((o) => (
                  <label
                    key={o.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${mode === o.value ? "border-[#2F6F5E] bg-[#F3F9F7]" : "border-[#E2E4E9]"}`}
                  >
                    <input type="radio" name="swap-mode" className="mt-1 h-4 w-4 accent-[#2F6F5E]" checked={mode === o.value} onChange={() => setMode(o.value)} />
                    <span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-[#1C2438]">
                        <o.icon className="h-4 w-4 text-[#2F6F5E]" /> {o.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-[#5B6478]">{o.help}</span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {mode === "person" && (
                <label className="mt-3 flex flex-col gap-1 text-sm">
                  <span className="font-medium text-[#1C2438]">{t("schedule.swap.choosePerson")}</span>
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    className="rounded-lg border border-[#E2E4E9] bg-white px-3 py-2.5 text-base text-[#1C2438] sm:text-sm"
                  >
                    <option value="">—</option>
                    {team.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                    {team.length > 0 && others.length > 0 && <option disabled>──────────</option>}
                    {others.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="mt-3 flex flex-col gap-1 text-sm">
                <span className="font-medium text-[#1C2438]">
                  {t("schedule.swap.message")} <span className="font-normal text-[#9AA1B2]">{t("schedule.optional")}</span>
                </span>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  placeholder={t("schedule.swap.messagePlaceholder")}
                  className="rounded-lg border border-[#E2E4E9] px-3 py-2.5 text-base text-[#1C2438] sm:text-sm"
                />
              </label>

              <p className="mt-3 rounded-lg bg-[#F7F8FA] px-3 py-2 text-xs text-[#5B6478]">{t("schedule.swap.howItWorks")}</p>
              <FeedbackLine feedback={feedback} />

              <button
                type="submit"
                disabled={busy !== null}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2F6F5E] px-4 py-3 text-base font-semibold text-white hover:bg-[#275D4F] disabled:opacity-60"
              >
                {busy === "give" ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRightLeft className="h-5 w-5" />}
                {t("schedule.swap.submit")}
              </button>
            </form>
          </div>
        </Portal>
      )}
    </div>
  );
}

// ---------- Quarts proposés par les collègues ----------

export function SwapOffers({ offers }: { offers: SwapOffer[] }) {
  const { t } = useI18n();
  const { busy, feedback, run } = useSwapAction();
  if (offers.length === 0 && !feedback) return null;

  return (
    <section className="rounded-xl border border-[#2F6F5E]/30 bg-[#F6FBF9] p-3.5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-[#1C2438]">
        <Hand className="h-5 w-5 text-[#2F6F5E]" /> {t("schedule.swap.offersTitle")}
      </h2>
      <p className="mt-0.5 text-sm text-[#5B6478]">{t("schedule.swap.offersSubtitle")}</p>
      <ul className="mt-3 space-y-2">
        {offers.map((o) => (
          <li key={o.id} className="rounded-lg border border-[#E2E4E9] bg-white px-3 py-2.5">
            <p className="text-base font-semibold text-[#1C2438]">
              <span className="capitalize">{o.dateLabel}</span> · {o.time}
            </p>
            {o.position && <p className="text-sm text-[#2F6F5E]">{o.position}</p>}
            <p className="mt-0.5 text-xs text-[#5B6478]">
              {t("schedule.swap.offeredBy", { name: o.fromName })}
              {o.toYou && ` · ${t("schedule.swap.offeredToYou")}`}
            </p>
            {o.status === "ACCEPTED" ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[#FFF4E0] px-2 py-1 text-xs font-medium text-[#8A5A12]">
                <Clock3 className="h-3.5 w-3.5" /> {t("schedule.swap.waitingApproval")}
              </p>
            ) : (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(t("schedule.swap.confirmTake"))) return;
                    run(`take-${o.id}`, `/api/shift-swaps/${o.id}`, "PATCH", { action: "accept" }, t("schedule.swap.done.taken"));
                  }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#2F6F5E] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none"
                >
                  {busy === `take-${o.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {t("schedule.swap.take")}
                </button>
                {o.toYou && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => run(`decline-${o.id}`, `/api/shift-swaps/${o.id}`, "PATCH", { action: "decline" }, t("schedule.swap.done.declined"))}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E2E4E9] bg-white px-3 py-2.5 text-sm font-medium text-[#1C2438] disabled:opacity-60"
                  >
                    {busy === `decline-${o.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    {t("schedule.swap.decline")}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <FeedbackLine feedback={feedback} />
    </section>
  );
}

// ---------- Responsable / admin : échanges à approuver ----------

export function SwapApprovals({ items }: { items: SwapApproval[] }) {
  const { t } = useI18n();
  const { busy, feedback, run } = useSwapAction();
  if (items.length === 0 && !feedback) return null;

  return (
    <section className="mb-4 rounded-xl border border-[#E0A43A]/50 bg-[#FFFAF0] p-3.5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-[#1C2438]">
        <ArrowRightLeft className="h-5 w-5 text-[#8A5A12]" /> {t("schedule.swap.approvalsTitle")} {items.length > 0 && `(${items.length})`}
      </h2>
      <p className="mt-0.5 text-sm text-[#5B6478]">{t("schedule.swap.approvalsSubtitle")}</p>
      <ul className="mt-3 space-y-2">
        {items.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#E2E4E9] bg-white px-3 py-2.5">
            <div className="min-w-0 flex-1 basis-56">
              <p className="text-sm font-semibold text-[#1C2438]">{t("schedule.swap.approvalLine", { from: s.fromName, taker: s.takerName })}</p>
              <p className="mt-0.5 text-sm text-[#5B6478]">
                <span className="capitalize">{s.dateLabel}</span> · {s.time}
                {s.position && ` · ${s.position}`}
              </p>
              {s.note && <p className="mt-0.5 text-xs italic text-[#5B6478]">« {s.note} »</p>}
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => run(`approve-${s.id}`, `/api/shift-swaps/${s.id}`, "PATCH", { action: "approve" }, t("schedule.swap.done.approved"))}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#2F6F5E] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none"
              >
                {busy === `approve-${s.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t("schedule.swap.approve")}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (!window.confirm(t("schedule.swap.confirmReject", { name: s.fromName }))) return;
                  run(`reject-${s.id}`, `/api/shift-swaps/${s.id}`, "PATCH", { action: "reject" }, t("schedule.swap.done.rejected"));
                }}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#E2E4E9] bg-white px-3 py-2.5 text-sm font-medium text-[#8A3B3B] disabled:opacity-60 sm:flex-none"
              >
                {busy === `reject-${s.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                {t("schedule.swap.reject")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <FeedbackLine feedback={feedback} />
    </section>
  );
}
