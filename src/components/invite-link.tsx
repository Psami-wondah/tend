"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Send } from "lucide-react";

/**
 * Send someone their invite link: the phone's own share sheet where there is
 * one (Messages, WhatsApp, email), otherwise a copy to paste. The button says
 * which it will do.
 */
export function InviteLink({ url, name, self = false, className }: { url: string; name: string; self?: boolean; className?: string }) {
  const [done, setDone] = useState(false);
  // Known only in the browser, so it starts as a copy and becomes a send on a phone.
  const [share, setShare] = useState(false);
  useEffect(() => setShare(typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches), []);

  async function send() {
    const text = self ? "My Tend link" : `${name}, this opens Tend for you. Keep it to yourself: it signs you in.`;
    try {
      if (share) {
        await navigator.share({ title: "Tend", text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setDone(true);
        setTimeout(() => setDone(false), 2500);
      }
    } catch {}
  }

  const Icon = done ? Check : share ? Send : Copy;
  const label = done ? "Copied" : share ? (self ? "Send my link" : "Send link") : self ? "Copy my link" : "Copy link";
  return (
    <button
      type="button"
      onClick={send}
      className={className ?? "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border-2 border-rule-strong px-3 text-sm font-bold hover:border-ink"}
    >
      <Icon aria-hidden size={className ? 18 : 16} />
      {label}
    </button>
  );
}
