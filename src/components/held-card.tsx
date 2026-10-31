"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaymentIntent } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { isDaytimeHour, localTime } from "@/lib/time";
import { personVar } from "@/lib/people";
import { Money, PersonChip, btn } from "./ui";
import { Txt } from "./figures-text";
import { useNow } from "./clock";

type Person = { id: string; name: string; city: string | null; timezone: string | null; color: string | null; role: string };

/**
 * A payment from the person's own PayPal, authorized but held. The ring is
 * the time left on the hold, drawn like a clock face in the payer's colour.
 * Anyone in the circle can stop it (the authorization is voided) or let it go.
 */
export function HeldCard(props: { intent: PaymentIntent; payer: Person | null; me: Person; circle: Person[]; initialNow: number }) {
  const { intent } = props;
  const router = useRouter();
  const now = useNow(props.initialNow, 30_000);
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const needsYes = intent.decision === "needs_approval";
  const isFamily = props.me.role === "owner" || props.me.role === "sibling";
  const amount = formatMoney(intent.amountMinor, intent.currency);

  const until = intent.holdUntil ? new Date(intent.holdUntil) : null;
  const start = new Date(intent.updatedAt);
  const total = until ? Math.max(1, until.getTime() - start.getTime()) : 1;
  const left = until ? Math.max(0, until.getTime() - now.getTime()) : 0;
  const frac = Math.min(1, left / total);
  const hours = Math.floor(left / 3600_000);
  const mins = Math.floor((left % 3600_000) / 60_000);
  const goesAt = until?.toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: props.me.timezone ?? undefined });

  async function act(verdict: "approve" | "reject") {
    setBusy(verdict);
    setError(null);
    const res = await fetch(`/api/payments/${intent.id}/verdict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: props.me.id, verdict, note: note.trim() || undefined }),
    });
    setBusy(null);
    setConfirmStop(false);
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Couldn't do that. Try again.");
    router.refresh();
  }

  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <article className="rounded-2xl border-2 border-wait/40 bg-dial p-4 shadow-[0_1px_2px_rgb(18_21_28/0.05),0_10px_24px_-14px_rgb(18_21_28/0.25)] sm:p-5" aria-labelledby={`h-${intent.id}`}>
      <div className="flex items-start gap-4">
        <div className="relative shrink-0" role="img" aria-label={needsYes ? "Held until someone says yes" : `${hours} hours ${mins} minutes left on the hold`}>
          <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden>
            <circle cx="38" cy="38" r={R} fill="none" stroke="var(--color-rule)" strokeWidth="7" />
            <circle
              cx="38"
              cy="38"
              r={R}
              fill="none"
              stroke={props.payer ? personVar(props.payer) : "var(--color-wait)"}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${C * frac} ${C}`}
              transform="rotate(-90 38 38)"
            />
          </svg>
          <span className="figures absolute inset-0 grid place-items-center text-center text-[0.8125rem] leading-tight font-semibold">
            {needsYes ? "wait" : hours > 0 ? `${hours}h` : `${mins}m`}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <Money minor={intent.amountMinor} currency={intent.currency} size="lg" />
          <h3 id={`h-${intent.id}`} className="mt-1 text-lg leading-snug font-bold break-words">
            {props.payer?.name ?? "Someone"} to {intent.payeeName}
          </h3>
          <p className="text-[0.9375rem] text-ink-soft">
            {needsYes ? "Held in their PayPal until one of you says yes." : <Txt>{`Held in their PayPal. It goes at ${goesAt} unless someone stops it.`}</Txt>}
          </p>
        </div>
      </div>

      <p className="mt-3 text-[0.9375rem]">
        <Txt>{intent.evaluation.reasons[0]?.message ?? intent.summary}</Txt>
      </p>

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Who can look">
        {props.circle.map((p) => {
          const t = localTime(p.timezone, now);
          const asleep = !isDaytimeHour(t.hour);
          return (
            <li key={p.id}>
              <PersonChip member={p.id === props.me.id ? { ...p, name: "You" } : p} note={p.id === props.me.id ? undefined : asleep ? `asleep, ${t.label}` : `awake, ${t.label}`} tone={asleep && p.id !== props.me.id ? "asleep" : "plain"} />
            </li>
          );
        })}
      </ul>

      {error && <p role="alert" className="mt-3 rounded-lg bg-stop-tint px-3 py-2 font-bold text-stop">{error}</p>}

      {isFamily &&
        (confirmStop ? (
          <div className="mt-4 rounded-xl bg-stop-tint p-3.5">
            <p className="font-bold">
              Stop <span className="figures">{amount}</span> to {intent.payeeName}? PayPal voids the hold and the money never leaves {props.payer?.name ?? "their"}&apos;s account.
            </p>
            <label className="mt-2 block text-sm font-bold" htmlFor={`n-${intent.id}`}>
              Tell them why (optional)
            </label>
            <input id={`n-${intent.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="I called them: it's not a real company" className="mt-1 min-h-11 w-full rounded-lg border-2 border-rule bg-dial px-3" />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => act("reject")} disabled={busy !== null} className={`${btn.danger} border-stop text-stop`}>
                {busy === "reject" ? "Stopping…" : "Yes, stop it"}
              </button>
              <button type="button" onClick={() => setConfirmStop(false)} className={btn.secondary}>
                Keep holding
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmStop(true)} disabled={busy !== null} className={`${btn.danger} border-stop/60`}>
              Stop it
            </button>
            <button type="button" onClick={() => act("approve")} disabled={busy !== null} className={needsYes ? btn.approve : btn.secondary}>
              {busy === "approve" ? "Releasing…" : needsYes ? "Say yes" : "Let it go now"}
            </button>
          </div>
        ))}

      <Link href={`/payments/${intent.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-ink-soft underline decoration-rule-strong hover:text-ink">
        <span aria-hidden className="size-2 rounded-full" style={{ background: props.payer ? personVar(props.payer) : "var(--color-wait)" }} />
        What they asked to pay, and why it&apos;s held
      </Link>
    </article>
  );
}
