"use client";

import { useState } from "react";
import { Check, Send } from "lucide-react";

/**
 * Send someone their invite link: the phone's own share sheet where there is
 * one (Messages, WhatsApp, email), otherwise a copy to paste.
 */
export function InviteLink({ url, name, self = false }: { url: string; name: string; self?: boolean }) {
  const [done, setDone] = useState(false);
  async function send() {
    const text = self ? "My Tend link" : `${name}, this opens Tend for you. Keep it to yourself: it signs you in.`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Tend", text, url });
      } else {
        await navigator.clipboard.writeText(url);
        setDone(true);
        setTimeout(() => setDone(false), 2500);
      }
    } catch {}
  }
  return (
    <button
      type="button"
      onClick={send}
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border-2 border-rule-strong px-3 text-sm font-bold hover:border-ink"
    >
      {done ? <Check aria-hidden size={16} /> : <Send aria-hidden size={16} />}
      {done ? "Copied" : self ? "Copy my link" : "Send link"}
    </button>
  );
}
