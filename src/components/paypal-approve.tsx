"use client";

import { createElement, useEffect, useRef, useState } from "react";
import { Wallet } from "lucide-react";

/**
 * PayPal JavaScript SDK v6: one-time payment session with the
 * <paypal-button> web component. The server creates the order (Tend decides
 * the intent: CAPTURE for top-ups, AUTHORIZE for held payments) and handles
 * approval. In demo mode there's no SDK; a clearly labelled button stands in
 * and runs the same server flow with a simulated order.
 */

type V6Session = { start: (opts: { presentationMode: string }, order: Promise<{ orderId: string }>) => Promise<void> };
type V6Sdk = {
  findEligibleMethods: (o: { currencyCode: string }) => Promise<{ isEligible: (m: string) => boolean }>;
  createPayPalOneTimePaymentSession: (o: {
    onApprove: (data: { orderId: string }) => Promise<void> | void;
    onCancel?: (data: unknown) => void;
    onError?: (err: unknown) => void;
  }) => V6Session;
};

declare global {
  interface Window {
    paypalV6?: { createInstance: (o: { clientToken: string; components: string[]; pageType?: string }) => Promise<V6Sdk> };
  }
}

const SDK_URL =
  process.env.NEXT_PUBLIC_PAYPAL_ENV === "live" ? "https://www.paypal.com/web-sdk/v6/core" : "https://www.sandbox.paypal.com/web-sdk/v6/core";

let sdkPromise: Promise<V6Sdk> | null = null;

async function loadSdk(): Promise<V6Sdk> {
  sdkPromise ??= (async () => {
    if (!document.querySelector(`script[src="${SDK_URL}"]`)) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = SDK_URL;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Couldn't load PayPal"));
        document.head.appendChild(s);
      });
    }
    // v6 registers itself as window.paypal; keep a stable handle.
    const g = window as unknown as { paypal?: Window["paypalV6"] };
    window.paypalV6 = g.paypal;
    const token = await fetch("/api/paypal/client-token").then((r) => r.json());
    if (!token.accessToken) throw new Error(token.error ?? "PayPal isn't configured");
    return window.paypalV6!.createInstance({ clientToken: token.accessToken, components: ["paypal-payments"], pageType: "checkout" });
  })();
  return sdkPromise;
}

export function PayPalApprove(props: {
  simulated: boolean;
  currency: string;
  /** Creates the order on the server; resolves to its id. */
  createOrder: () => Promise<string>;
  onApproved: (orderId: string) => Promise<void> | void;
  onError?: (message: string) => void;
  simulatedLabel: string;
  disabled?: boolean;
  big?: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable" | "busy">(props.simulated ? "ready" : "loading");
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    if (props.simulated || !holder.current) return;
    let cancelled = false;
    (async () => {
      try {
        const sdk = await loadSdk();
        const methods = await sdk.findEligibleMethods({ currencyCode: props.currency });
        if (!methods.isEligible("paypal")) return !cancelled && setState("unavailable");
        const session = sdk.createPayPalOneTimePaymentSession({
          onApprove: async (data) => {
            setState("busy");
            await cb.current.onApproved(data.orderId);
            setState("ready");
          },
          onCancel: () => setState("ready"),
          onError: (err) => {
            setState("ready");
            cb.current.onError?.(err instanceof Error ? err.message : "PayPal couldn't finish that.");
          },
        });
        if (cancelled || !holder.current) return;
        const button = holder.current.querySelector("paypal-button");
        button?.removeAttribute("hidden");
        button?.addEventListener("click", () => {
          void session.start({ presentationMode: "auto" }, cb.current.createOrder().then((orderId) => ({ orderId })));
        });
        setState("ready");
      } catch (e) {
        if (!cancelled) {
          setState("unavailable");
          cb.current.onError?.(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.simulated, props.currency]);

  if (props.simulated) {
    return (
      <button
        type="button"
        disabled={props.disabled || state === "busy"}
        onClick={async () => {
          setState("busy");
          try {
            const orderId = await props.createOrder();
            await props.onApproved(orderId);
          } catch (e) {
            props.onError?.(e instanceof Error ? e.message : String(e));
          } finally {
            setState("ready");
          }
        }}
        className={`inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-action px-5 py-2.5 font-bold text-action-ink transition-colors duration-200 hover:bg-action-hover disabled:opacity-55 ${props.big ? "min-h-20 text-[1.35em]" : "min-h-12 text-base"}`}
      >
        <Wallet aria-hidden size={props.big ? 28 : 19} className="shrink-0" />
        <span className="text-left leading-tight">
          {state === "busy" ? "One moment…" : props.simulatedLabel}
          <span className="block text-[0.62em] font-medium opacity-80">Simulated PayPal, no real money</span>
        </span>
      </button>
    );
  }

  return (
    <div ref={holder} className={props.big ? "min-h-20" : "min-h-12"}>
      {createElement("paypal-button", { type: "pay", hidden: true, class: "paypal-gold" })}
      {state === "loading" && <div className="skeleton h-12 w-full" aria-label="Loading PayPal" />}
      {state === "unavailable" && <p className="font-bold text-stop">PayPal isn&apos;t available right now.</p>}
      {state === "busy" && <p role="status" className="mt-2 font-bold">Confirming with PayPal…</p>}
    </div>
  );
}
