"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { btn } from "./ui";

type State = "loading" | "unsupported" | "denied" | "off" | "on" | "busy";

function supported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function flagKey(memberId: string) {
  return `tend.alerts.${memberId}`;
}

function toKey(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Alerts on this device. Once on, a held payment arrives as a notification
 * with Stop it and Say yes on it, so the second key works from a lock screen.
 */
export function AlertsToggle({ memberId, person }: { memberId: string; person: string }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);
  // An iPhone shows a web app's notification without buttons; a tap opens the payment instead.
  const [buttons, setButtons] = useState(true);

  useEffect(() => {
    setButtons(!/iPhone|iPad|iPod/.test(navigator.userAgent));
    if (!supported()) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    let on = false;
    try {
      on = localStorage.getItem(flagKey(memberId)) === "on";
    } catch {}
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(on && sub && Notification.permission === "granted" ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, [memberId]);

  async function turnOn() {
    setState("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push")).json();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, subscription: sub.toJSON() }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't turn alerts on.");
      try {
        localStorage.setItem(flagKey(memberId), "on");
      } catch {}
      setState("on");
    } catch (e) {
      // Browsers word this for developers ("User denied push permission"); say what to do instead.
      const refused = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "AbortError");
      setError(
        refused
          ? "This device wouldn't let Tend send alerts. Check that notifications are allowed for Tend in the phone's Settings. Held payments still show here."
          : e instanceof Error
            ? e.message
            : "Couldn't turn alerts on.",
      );
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId, endpoint: sub.endpoint }) });
    try {
      localStorage.removeItem(flagKey(memberId));
    } catch {}
    setState("off");
  }

  if (state === "loading") return <div className="h-[7.5rem] rounded-2xl bg-dial" aria-hidden />;

  const Icon = state === "on" ? BellRing : state === "denied" || state === "unsupported" ? BellOff : Bell;
  return (
    <section aria-labelledby="alerts" className="rounded-2xl bg-dial p-4">
      <h2 id="alerts" className="flex items-center gap-2 font-bold">
        <Icon aria-hidden size={20} className={state === "on" ? "text-paid" : "text-ink-soft"} />
        {state === "on" ? "Alerts are on" : "Alerts on this device"}
      </h2>
      <p className="mt-1 text-[0.9375rem] text-ink-soft">
        {state === "on"
          ? buttons
            ? `When something of ${person}'s is held, you'll get a notification with Stop it and Say yes on it.`
            : `When something of ${person}'s is held, you'll get a notification. Tap it to stop the payment or say yes.`
          : state === "denied"
            ? "Notifications are blocked for Tend in this browser's settings."
            : state === "unsupported"
              ? "This browser can't show alerts. On an iPhone, add Tend to the Home Screen first."
              : `Get a notification the moment something of ${person}'s is held, and stop it from there.`}
      </p>
      {(state === "off" || state === "busy") && (
        <button type="button" onClick={turnOn} disabled={state === "busy"} className={`${btn.primary} mt-3 w-full`}>
          {state === "busy" ? "Turning on…" : "Turn on alerts"}
        </button>
      )}
      {state === "on" && (
        <button type="button" onClick={turnOff} className="mt-2 text-sm font-bold text-ink-soft underline decoration-rule-strong hover:text-ink">
          Turn off on this device
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-stop">
          {error}
        </p>
      )}
    </section>
  );
}
