"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserRoundPlus } from "lucide-react";
import type { PaymentIntent } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { isDaytimeHour, localTime } from "@/lib/time";
import { categoryLabel } from "@/lib/mandate/edit";
import { CATEGORIES } from "@/lib/mandate/types";
import { Reasons, Stages } from "./reasons";
import { Money, PersonChip, StatusBadge, btn, field } from "./ui";
import { Txt } from "./figures-text";
import { useNow } from "./clock";

type Person = { id: string; name: string; city: string | null; timezone: string | null; color: string | null; role: string };

export function ApprovalCard(props: {
  intent: PaymentIntent;
  approvals: { memberId: string; name: string; at?: Date | string }[];
  myVote: "approve" | "reject" | null;
  me: Person;
  family: Person[];
  initialNow: number;
  showLink?: boolean;
  /** Home screen: amount, payee, the deciding reason, who's approved, and the buttons. */
  compact?: boolean;
}) {
  const { intent, me } = props;
  const router = useRouter();
  const now = useNow(props.initialNow);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const isFamily = me.role === "owner" || me.role === "sibling";
  const approvedIds = new Set(props.approvals.map((a) => a.memberId));
  const approvedAt = (id: string) => props.approvals.find((a) => a.memberId === id)?.at;
  const headline = intent.evaluation.reasons.find((r) => r.effect !== "auto_pay") ?? intent.evaluation.reasons[0];
  const remaining = Math.max(0, intent.approvalsRequired - props.approvals.length);
  const unknownPayee = !intent.payeeId;
  const amount = formatMoney(intent.amountMinor, intent.currency);

  async function vote(verdict: "approve" | "reject") {
    setBusy(verdict);
    setError(null);
    const res = await fetch(`/api/payments/${intent.id}/verdict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: me.id, verdict }),
    });
    setBusy(null);
    setConfirmDecline(false);
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't record that. Try again.");
    router.refresh();
  }

  return (
    <article className="rounded-2xl border-2 border-wait/35 bg-dial p-4 shadow-[0_1px_2px_rgb(18_21_28/0.05),0_10px_24px_-14px_rgb(18_21_28/0.25)] sm:p-5" aria-labelledby={`p-${intent.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Money minor={intent.amountMinor} currency={intent.currency} size="lg" />
          <h3 id={`p-${intent.id}`} className="mt-1.5 text-lg leading-snug font-bold break-words">
            {intent.payeeName}
          </h3>
          {!props.compact && <p className="text-[0.9375rem] text-ink-soft">{categoryLabel(intent.category)}</p>}
        </div>
        <StatusBadge status={intent.status} />
      </div>

      {props.compact ? (
        headline && (
          <p className="mt-3 text-[0.9375rem]">
            <Txt>{headline.message}</Txt>
          </p>
        )
      ) : (
        <>
          <p className="mt-2 text-ink-soft">
            <Txt>{intent.summary}</Txt>
          </p>
          <div className="mt-4">
            <Stages status={intent.status} decision={intent.decision} approvalsRequired={intent.approvalsRequired} />
          </div>
          <div className="mt-4 border-t border-rule pt-4">
            <Reasons reasons={intent.evaluation.reasons} compact />
          </div>
        </>
      )}

      {unknownPayee && isFamily && (
        <div className="mt-4 rounded-xl bg-enamel p-3.5">
          {!adding ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-[0.9375rem]">Tend can only pay people the circle has added. Do you know who {intent.payeeName} is?</p>
              <button type="button" onClick={() => setAdding(true)} className={`${btn.secondary} w-full sm:w-auto`}>
                <UserRoundPlus aria-hidden size={18} />
                Add as a payee
              </button>
            </div>
          ) : (
            <AddPayeeInline intent={intent} memberId={me.id} onDone={() => { setAdding(false); router.refresh(); }} />
          )}
        </div>
      )}

      <div className={props.compact ? "mt-3" : "mt-4"}>
        <p className="mb-2 text-[0.9375rem] font-bold">
          {intent.status === "on_hold"
            ? "Waiting for a top-up. Approvals still count."
            : remaining > 0
              ? `${remaining} more ${remaining === 1 ? "approval" : "approvals"} needed`
              : "Fully approved"}
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Who can approve">
          {props.family.map((p) => {
            const t = localTime(p.timezone, now);
            const asleep = !isDaytimeHour(t.hour);
            return (
              <li key={p.id}>
                {approvedIds.has(p.id) ? (
                  <PersonChip
                    member={p}
                    note={approvedAt(p.id) ? `approved ${localTime(p.timezone, new Date(approvedAt(p.id)!)).label}` : "approved"}
                    tone="done"
                  />
                ) : p.id === me.id ? (
                  <PersonChip member={{ ...p, name: "You" }} note={props.myVote === "reject" ? "declined" : undefined} />
                ) : (
                  <PersonChip member={p} note={asleep ? `asleep, ${t.label}` : `awake, ${t.label}`} tone={asleep ? "asleep" : "plain"} />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-stop-tint px-3 py-2 font-bold text-stop">
          {error}
        </p>
      )}

      {isFamily && (
        <div className="mt-4">
          {props.myVote === "approve" ? (
            <p className="font-bold text-paid">
              You approved this.{" "}
              {remaining === 1 ? "Tend pays it when one more person says yes." : remaining > 1 ? `Tend pays it when ${remaining} more people say yes.` : ""}
            </p>
          ) : confirmDecline ? (
            <div className="rounded-xl bg-stop-tint p-3.5">
              <p className="font-bold">
                Decline <span className="figures">{amount}</span> to {intent.payeeName}? Nobody will be paid, and the circle will see you declined.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => vote("reject")} disabled={busy !== null} className={`${btn.danger} border-stop text-stop`}>
                  {busy === "reject" ? "Declining…" : "Yes, decline it"}
                </button>
                <button type="button" onClick={() => setConfirmDecline(false)} className={btn.secondary}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button type="button" onClick={() => vote("approve")} disabled={busy !== null || unknownPayee} className={btn.approve}>
                {busy === "approve" ? (
                  "Approving…"
                ) : (
                  <span>
                    Approve <span className="figures font-semibold">{amount}</span>
                  </span>
                )}
              </button>
              <button type="button" onClick={() => setConfirmDecline(true)} disabled={busy !== null} className={btn.danger}>
                Decline
              </button>
            </div>
          )}
          {unknownPayee && props.myVote !== "approve" && <p className="mt-2 text-sm text-ink-soft">Add the payee first, then approve.</p>}
        </div>
      )}

      {props.showLink !== false && (
        <Link href={`/payments/${intent.id}`} className="mt-3 inline-block text-sm font-bold text-ink-soft underline decoration-rule-strong hover:text-ink">
          {props.compact ? "Why, and what happened so far" : "What happened so far"}
        </Link>
      )}
    </article>
  );
}

function AddPayeeInline({ intent, memberId, onDone }: { intent: PaymentIntent; memberId: string; onDone: () => void }) {
  const [name, setName] = useState(intent.payeeName === "Unknown" ? "" : intent.payeeName);
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState(intent.category);
  const [vouch, setVouch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/payments/${intent.id}/payee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, newPayee: { name, paypalEmail: email, kind, vouch } }),
    });
    setBusy(false);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? "Couldn't add them.");
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <p className="font-bold">Add {intent.payeeName === "Unknown" ? "this payee" : intent.payeeName}</p>
      <label className="block">
        <span className="text-sm font-bold">Name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-1`} />
      </label>
      <label className="block">
        <span className="text-sm font-bold">Their PayPal email</span>
        <input required type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={`${field} mt-1`} placeholder="Check this with them, not from the bill" />
      </label>
      <label className="block">
        <span className="text-sm font-bold">What they are</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} mt-1`}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-start gap-3 text-[0.9375rem]">
        <input type="checkbox" checked={vouch} onChange={(e) => setVouch(e.target.checked)} className="mt-1 size-5 accent-[var(--color-paid)]" />
        <span>I&apos;ve confirmed this PayPal account belongs to them. Otherwise, verify them with a one-cent check on the Payees page.</span>
      </label>
      {error && <p role="alert" className="font-bold text-stop">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className={btn.primary}>{busy ? "Adding…" : "Add payee"}</button>
        <button type="button" onClick={onDone} className={btn.secondary}>Cancel</button>
      </div>
    </form>
  );
}
