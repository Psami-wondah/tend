"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PayPalApprove } from "./paypal-approve";
import { ReceiptText, Undo2 } from "lucide-react";
import type { Recovery, Contribution } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { btn, field, Money, SimTag } from "./ui";
import { Txt } from "./figures-text";

async function post(url: string, data: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

// --- Double payments ----------------------------------------------------------------

export function RecoveryCard({ r, memberId, simulated }: { r: Recovery; memberId: string; simulated: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function act(action: "request" | "dismiss" | "simulate-paid") {
    setBusy(action);
    setError(null);
    try {
      await post(`/api/recoveries/${r.id}`, { memberId, action });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  const amount = formatMoney(r.amountMinor, r.currency);
  return (
    <article className="rounded-3xl border-2 border-accent/30 bg-dial p-5 sm:p-7">
      <div className="flex items-start gap-4">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center text-accent">
          <Undo2 size={20} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg leading-snug font-bold">
            <Txt>{r.status === "found" ? `${r.payeeName} was paid ${amount} twice` : `Asked ${r.payeeName} for ${amount} back`}</Txt>
          </h3>
          <p className="mt-2 leading-relaxed text-ink-soft">
            {r.status === "found"
              ? "Same bill, same amount, a day apart. Tend can send them a PayPal invoice for the second payment."
              : "Tend sent them a PayPal refund invoice. The money comes back into the pot when they pay it."}
          </p>
          {r.paypalInvoiceId && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.9375rem] leading-relaxed text-ink-soft">
              Invoice <span className="figures">{r.paypalInvoiceId}</span> <SimTag id={r.paypalInvoiceId} />
            </p>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-3 font-bold text-stop">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-3 border-t border-rule pt-5 empty:hidden">
        {r.status === "found" ? (
          <>
            <button type="button" onClick={() => act("request")} disabled={busy !== null} className={btn.primary}>
              {busy === "request" ? "Sending invoice…" : <Txt>{`Ask for ${amount} back`}</Txt>}
            </button>
            <button type="button" onClick={() => act("dismiss")} disabled={busy !== null} className={btn.secondary}>
              It was right
            </button>
          </>
        ) : (
          simulated &&
          r.paypalInvoiceId?.startsWith("SIM-") && (
            <button type="button" onClick={() => act("simulate-paid")} disabled={busy !== null} className={btn.secondary}>
              {busy ? "Recording…" : `Simulate ${r.payeeName} paying it`}
            </button>
          )
        )}
      </div>
    </article>
  );
}

// --- Top up --------------------------------------------------------------------------

const PRESETS = [25, 50, 100, 250];

/**
 * Top up the pot with PayPal (JavaScript SDK v6; the order is created and
 * captured server-side). Demo mode runs the same server flow with a
 * simulated order, behind a button that says so.
 */
export function TopUp({ memberId, currency, homeCurrency, mode }: {
  memberId: string;
  currency: string;
  homeCurrency: string | null;
  mode: "sandbox" | "live" | "simulated";
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(50);
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef(amount);
  amountRef.current = amount;
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-[0.9375rem] font-bold">How much?</legend>
        <div className="grid grid-cols-4 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(p)}
              aria-pressed={amount === p}
              className={`figures min-h-12 rounded-xl border-2 text-lg font-medium transition-colors duration-200 ${
                amount === p ? "border-action bg-action text-action-ink" : "border-rule bg-dial hover:border-ink"
              }`}
            >
              {fmt(p)}
            </button>
          ))}
        </div>
      </fieldset>
      {homeCurrency && homeCurrency !== currency && (
        <p className="text-[0.9375rem] leading-relaxed text-ink-soft">You pay from {homeCurrency}; PayPal shows the exact conversion before you confirm.</p>
      )}
      <PayPalApprove
        simulated={mode === "simulated"}
        currency={currency}
        simulatedLabel={`Add ${fmt(amount)} with PayPal`}
        createOrder={async () => (await post("/api/topup/create", { memberId, amount: amountRef.current })).orderId}
        onApproved={async (orderId) => {
          try {
            await post("/api/topup/capture", { orderId });
            setState("done");
            router.refresh();
          } catch (e) {
            setState("error");
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
        onError={(m) => {
          setState("error");
          setError(m);
        }}
      />
      {state === "done" && <p className="font-bold text-paid">Added to the pot. Thank you.</p>}
      {state === "error" && <p role="alert" className="font-bold text-stop">Top-up didn&apos;t go through: {error}</p>}
    </div>
  );
}

// --- Everyone chip in ----------------------------------------------------------------

export function ShareRequest({ family, currency }: { family: number; currency: string }) {
  const router = useRouter();
  const [total, setTotal] = useState("450");
  const [note, setNote] = useState("November carer hours");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const json = await post("/api/shares", { total: Number(total), note });
      const failed = json.results.filter((r: { error?: string }) => r.error);
      setStatus(failed.length ? { ok: false, text: `Sent with ${failed.length} problem(s): ${failed[0].error}` } : { ok: true, text: `Invoices sent to all ${family} of you.` });
      router.refresh();
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }
  const n = Number(total);
  const share = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n > 0 ? Math.ceil((n * 100) / family) / 100 : 0);
  return (
    <form onSubmit={send} className="space-y-4">
      <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] gap-3">
        <label className="block">
          <span className="text-sm font-bold">Total</span>
          <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ""))} className={`${field} figures mt-2 text-lg`} />
        </label>
        <label className="block">
          <span className="text-sm font-bold">What it&apos;s for</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${field} mt-2`} />
        </label>
      </div>
      <button disabled={busy || !(n > 0) || !note.trim()} className={`${btn.secondary} w-full`}>
        <ReceiptText aria-hidden size={18} />
        {busy ? "Sending invoices…" : <Txt>{`Invoice each of you ${share}`}</Txt>}
      </button>
      {status && <p role="status" className={`text-sm font-bold ${status.ok ? "text-paid" : "text-stop"}`}>{status.text}</p>}
    </form>
  );
}

/** "You owe your share": a sibling's open invoice. Demo mode can simulate paying it. */
export function MyShare({ c, memberId }: { c: Contribution; memberId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sim = c.paypalInvoiceId?.startsWith("SIM-");
  async function pay() {
    setBusy(true);
    try {
      await post(`/api/shares/${c.id}/simulate-pay`, { memberId });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-rule bg-dial p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          Your share: <Money minor={c.amountMinor} currency={c.currency} size="sm" />
        </p>
        <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] leading-relaxed text-ink-soft">
          {sim ? "A PayPal invoice is waiting for you." : "Check your PayPal email for the invoice."} <SimTag id={c.paypalInvoiceId} />
        </p>
        {error && <p role="alert" className="text-sm font-bold text-stop">{error}</p>}
      </div>
      {sim && (
        <button type="button" onClick={pay} disabled={busy} className={`${btn.primary} w-full sm:w-auto`}>
          {busy ? "Paying…" : "Pay my share (simulated)"}
        </button>
      )}
    </div>
  );
}

/** While a payout is in flight. The page itself stays current through <Live />. */
export function WaitingForPayPal() {
  return (
    <p role="status" className="flex items-center gap-2 text-[0.9375rem] leading-relaxed text-ink-soft">
      <span aria-hidden className="pulse-dot size-2 rounded-full bg-wait" />
      Waiting for PayPal to confirm a payment…
    </p>
  );
}

export function ScanButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        const json = await post("/api/recoveries/scan", {}).catch(() => ({ found: 0 }));
        setNote(json.found ? `Found ${json.found}.` : "Nothing paid twice.");
        setBusy(false);
        router.refresh();
      }}
      className={btn.quiet}
    >
      {busy ? "Checking…" : note ?? "Check for double payments"}
    </button>
  );
}
