"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BellRing, ShieldAlert, X } from "lucide-react";

type Banner = { id: string; intentId: string | null; severity: "action" | "danger"; title: string; body: string };

/**
 * Keeps whatever page is open up to date, on every device. Every few seconds,
 * the moment a phone alert arrives, and whenever the page comes back into
 * view, it asks Tend whether anything in the circle has changed, and reloads
 * the page's data only when it has (so nothing being typed or built is lost
 * to a reload that changes nothing). Something newly held or refused also
 * slides in as a banner for the circle's helpers.
 */
export function Live({ every = 4_000 }: { every?: number }) {
  const router = useRouter();
  const [shown, setShown] = useState<Banner | null>(null);
  const since = useRef(0);
  const version = useRef<string | null>(null);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let stop = false;
    let busy = false;
    async function check() {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await fetch(`/api/live${since.current ? `?after=${since.current}` : ""}`, { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { now: number; version: string | null; alerts: Banner[] };
        if (stop) return;
        since.current = json.now;

        const first = seen.current === null;
        const fresh = json.alerts.filter((a) => !seen.current?.has(a.id));
        seen.current = new Set([...(seen.current ?? []), ...json.alerts.map((a) => a.id)]);
        if (!first && fresh.length) setShown(fresh[0]);

        const moved = version.current !== null && json.version !== version.current;
        version.current = json.version;
        if (moved) router.refresh();
      } catch {
        /* offline for a moment; the next check catches up */
      } finally {
        busy = false;
      }
    }
    void check();
    const t = setInterval(check, every);
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "tend-refresh") void check();
    };
    const onVisible = () => void check();
    navigator.serviceWorker?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      stop = true;
      clearInterval(t);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [router, every]);

  if (!shown) return null;
  const danger = shown.severity === "danger";
  const Icon = danger ? ShieldAlert : BellRing;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div
        role="alert"
        className="live-alert pointer-events-auto flex w-full max-w-lg items-start gap-3 rounded-2xl bg-dial p-3.5 text-ink shadow-[0_12px_40px_-8px_rgb(10_14_40/0.45)] ring-1 ring-rule"
      >
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${danger ? "bg-stop text-white" : "bg-day text-night"}`}>
          <Icon aria-hidden size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug">{shown.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[0.9375rem] text-ink-soft">{shown.body}</p>
          {shown.intentId && (
            <Link
              href={`/payments/${shown.intentId}`}
              onClick={() => setShown(null)}
              className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-action px-4 text-sm font-bold text-action-ink"
            >
              {danger ? "See why" : "Look now"}
            </Link>
          )}
        </div>
        <button type="button" onClick={() => setShown(null)} className="-m-1 grid size-10 shrink-0 place-items-center rounded-lg text-ink-soft hover:text-ink" aria-label="Dismiss">
          <X aria-hidden size={18} />
        </button>
      </div>
    </div>
  );
}
