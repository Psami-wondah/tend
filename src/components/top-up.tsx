"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void>; close?: () => void };
    };
  }
}

const PRESETS = [25, 50, 100, 250];

/** Top up the pot with PayPal Checkout (orders created and captured server-side). */
export function TopUp({ memberId, currency }: { memberId: string; currency: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState(50);
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const amountRef = useRef(amount);
  amountRef.current = amount;
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !holder.current) return;
    let buttons: { close?: () => void } | undefined;
    const src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&intent=capture&components=buttons`;
    const render = () => {
      if (!window.paypal || !holder.current) return;
      holder.current.innerHTML = "";
      const b = window.paypal.Buttons({
        style: { layout: "horizontal", tagline: false, height: 48 },
        createOrder: async () => {
          const res = await fetch("/api/topup/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memberId, amount: amountRef.current }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error);
          return json.orderId;
        },
        onApprove: async (data: { orderID: string }) => {
          const res = await fetch("/api/topup/capture", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: data.orderID }),
          });
          if (res.ok) {
            setState("done");
            router.refresh();
          } else {
            setState("error");
            setError((await res.json()).error);
          }
        },
        onError: (err: unknown) => {
          setState("error");
          setError(String(err));
        },
      });
      buttons = b;
      void b.render(holder.current);
    };
    let script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (window.paypal) render();
    else {
      if (!script) {
        script = document.createElement("script");
        script.src = src;
        document.body.appendChild(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      script?.removeEventListener("load", render);
      buttons?.close?.();
    };
  }, [clientId, currency, memberId, router]);

  if (!clientId) {
    return <p className="text-sm text-ink-soft">Set NEXT_PUBLIC_PAYPAL_CLIENT_ID to enable PayPal top-ups.</p>;
  }

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 font-bold">How much?</legend>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(p)}
            aria-pressed={amount === p}
            className={`figures min-h-11 rounded-xl border-2 px-4 font-bold ${
              amount === p ? "border-passbook bg-passbook-tint text-passbook" : "border-rule"
            }`}
          >
            {new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(p)}
          </button>
        ))}
      </fieldset>
      <div ref={holder} className="min-h-12" />
      {state === "done" && <p className="font-bold text-passbook">Added to the pot. Thank you.</p>}
      {state === "error" && <p role="alert" className="font-bold text-brick">Top-up didn't go through: {error}</p>}
    </div>
  );
}
