"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, Check, Copy, Store } from "lucide-react";

/** The first three things to do in a circle that's just been set up. */
export function GettingStarted({ person, link, payees }: { person: string; link: string; payees: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <section aria-labelledby="start" className="rounded-2xl border-2 border-accent/30 bg-dial p-4 sm:p-5">
      <h2 id="start" className="font-display text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">
        Getting {person}&apos;s circle going
      </h2>
      <ol className="mt-3 space-y-3">
        <li className="flex flex-wrap items-center gap-3">
          <Copy aria-hidden size={20} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Send {person} their link</span>
            <span className="block text-[0.9375rem] text-ink-soft">It opens their screen: take a photo of a bill, say it out loud, or check a message.</span>
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {}
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-rule-strong px-3 text-sm font-bold hover:border-ink"
          >
            {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </li>
        <li className="flex flex-wrap items-center gap-3">
          <Store aria-hidden size={20} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Add who {person} pays</span>
            <span className="block text-[0.9375rem] text-ink-soft">The pharmacy, the electric company, a carer. Tend checks each one with a one-cent PayPal payment.</span>
          </span>
          {payees > 0 ? (
            <span className="inline-flex items-center gap-1 text-sm font-bold text-paid">
              <Check aria-hidden size={16} /> {payees} added
            </span>
          ) : (
            <Link href="/payees" className="inline-flex min-h-10 items-center rounded-xl border-2 border-rule-strong px-3 text-sm font-bold hover:border-ink">
              Add payees
            </Link>
          )}
        </li>
        <li className="flex items-center gap-3">
          <Bell aria-hidden size={20} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Turn on alerts</span>
            <span className="block text-[0.9375rem] text-ink-soft">So a held payment reaches you wherever you are, with Stop it on the notification.</span>
          </span>
        </li>
      </ol>
    </section>
  );
}
