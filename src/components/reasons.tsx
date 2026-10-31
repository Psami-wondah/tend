import { Check, CircleHelp, Clock3, Hourglass, X } from "lucide-react";
import type { Reason } from "@/lib/mandate/types";
import type { IntentStatus } from "@/lib/db/schema";
import { Txt } from "./figures-text";

const MARK: Record<Reason["effect"], { Icon: typeof Check; cls: string; sr: string }> = {
  refuse: { Icon: X, cls: "bg-stop-tint text-stop", sr: "Refuses:" },
  hold: { Icon: Clock3, cls: "bg-wait-tint text-wait", sr: "Holds:" },
  needs_approval: { Icon: CircleHelp, cls: "bg-wait-tint text-wait", sr: "Needs approval:" },
  cool_off: { Icon: Hourglass, cls: "bg-wait-tint text-wait", sr: "Held for a while:" },
  auto_pay: { Icon: Check, cls: "bg-paid-tint text-paid", sr: "Allows:" },
};

/** The mandate's reasons, in plain words. This is Tend showing its working. */
export function Reasons({ reasons, compact = false }: { reasons: Reason[]; compact?: boolean }) {
  return (
    <ul className={compact ? "space-y-1.5" : "space-y-2.5"}>
      {reasons.map((r) => {
        const m = MARK[r.effect];
        return (
          <li key={r.code} className="flex gap-2.5 leading-snug">
            <span aria-hidden className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${m.cls}`}>
              <m.Icon size={13} strokeWidth={3} />
            </span>
            <span className={compact ? "text-[0.9375rem]" : ""}>
              <span className="sr-only">{m.sr} </span>
              <Txt>{r.message}</Txt>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type Stage = { label: string; state: "done" | "now" | "skip" | "fail" | "todo"; note?: string };

/**
 * A payment's life at one fixed scale: read, checked against the rules, the
 * family, PayPal. Any two payments compare at a glance.
 */
export function stagesFor(status: IntentStatus, decision: string, approvalsRequired: number): Stage[] {
  const read: Stage = { label: "Read", state: "done" };
  const rules: Stage = { label: "Rules", state: decision === "refuse" ? "fail" : "done", note: decision === "refuse" ? "refused" : undefined };
  const familyNeeded = approvalsRequired > 0 || status === "awaiting_approval" || status === "rejected";
  let family: Stage = { label: "Circle", state: familyNeeded ? "done" : "skip", note: familyNeeded ? undefined : "not needed" };
  let paypal: Stage = { label: "PayPal", state: "todo" };
  switch (status) {
    case "refused":
      family = { label: "Circle", state: "todo" };
      break;
    case "awaiting_approval":
      family = { label: "Circle", state: "now", note: "waiting" };
      break;
    case "on_hold":
      family = { label: "Circle", state: "now", note: "top-up" };
      break;
    case "rejected":
      family = { label: "Circle", state: "fail", note: "declined" };
      break;
    case "approved":
    case "paying":
      paypal = { label: "PayPal", state: "now", note: "sending" };
      break;
    case "paid":
      paypal = { label: "PayPal", state: "done", note: "paid" };
      break;
    case "failed":
      paypal = { label: "PayPal", state: "fail", note: "failed" };
      break;
    case "awaiting_payer":
      family = { label: "Circle", state: "todo" };
      paypal = { label: "PayPal", state: "now", note: "approve" };
      break;
    case "held":
      family = { label: "Circle", state: "now", note: decision === "needs_approval" ? "waiting" : "can stop it" };
      paypal = { label: "PayPal", state: "done", note: "held" };
      break;
    case "voided":
      family = { label: "Circle", state: "fail", note: "stopped" };
      paypal = { label: "PayPal", state: "skip", note: "never sent" };
      break;
  }
  return [read, rules, family, paypal];
}

const STAGE_CLS: Record<Stage["state"], { bar: string; text: string }> = {
  done: { bar: "bg-paid", text: "text-ink" },
  now: { bar: "bg-wait", text: "text-wait font-bold" },
  skip: { bar: "bg-rule", text: "text-ink-soft" },
  fail: { bar: "bg-stop", text: "text-stop font-bold" },
  todo: { bar: "bg-rule", text: "text-ink-soft" },
};

export function Stages({ status, decision, approvalsRequired }: { status: IntentStatus; decision: string; approvalsRequired: number }) {
  const stages = stagesFor(status, decision, approvalsRequired);
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Where this payment is">
      {stages.map((s) => (
        <li key={s.label} className="min-w-0">
          <span aria-hidden className={`block h-1.5 rounded-full ${STAGE_CLS[s.state].bar}`} />
          <span className={`mt-1.5 block text-[0.8125rem] leading-tight ${STAGE_CLS[s.state].text}`}>{s.label}</span>
          {s.note && <span className="block text-xs leading-tight text-ink-soft">{s.note}</span>}
        </li>
      ))}
    </ol>
  );
}
