"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** "Everyone chip in" — Tend sends each sibling a PayPal invoice for their share. */
export function ShareRequest({ siblings, currency }: { siblings: number; currency: string }) {
  const router = useRouter();
  const [total, setTotal] = useState("300");
  const [note, setNote] = useState("Next month's carer hours");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const res = await fetch("/api/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total: Number(total), note }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setStatus(json.error);
    const failed = json.results.filter((r: { error?: string }) => r.error);
    setStatus(failed.length ? `Sent with ${failed.length} problem(s): ${failed[0].error}` : `Invoices sent to all ${siblings}.`);
    router.refresh();
  }

  const share = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(total) > 0 ? Number(total) / siblings : 0);

  return (
    <form onSubmit={send} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <label className="block">
          <span className="font-bold">Total</span>
          <input
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            className="figures mt-1 min-h-12 w-full rounded-xl border-2 border-rule bg-sheet px-3 text-lg"
          />
        </label>
        <label className="block">
          <span className="font-bold">What it's for</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border-2 border-rule bg-sheet px-3 text-lg"
          />
        </label>
      </div>
      <button disabled={busy} className="min-h-12 rounded-xl bg-ink px-6 font-bold text-paper disabled:opacity-60">
        {busy ? "Sending invoices…" : `Invoice ${siblings} people ${share} each`}
      </button>
      {status && <p className="text-sm font-bold">{status}</p>}
    </form>
  );
}
