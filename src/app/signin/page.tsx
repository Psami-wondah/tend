import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Link2 } from "lucide-react";
import { examplesOn } from "@/lib/examples";

export const metadata: Metadata = { title: "Sign in" };

/** Where anyone without a session lands: Tend opens from each person's own link. */
export default async function SignIn({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  const expired = link === "expired";
  return (
    <main className="on-night grid min-h-dvh place-items-center bg-night px-4 py-10 text-night-ink">
      <div className="w-full max-w-md">
        <Link href="/" className="font-display text-[1.75rem] font-semibold tracking-[-0.01em]">
          Tend
        </Link>
        <Link2 aria-hidden size={36} className="mt-10 text-day" />
        <h1 className="mt-4 font-display text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.01em]">
          {expired ? "That link doesn't open anything any more" : "Open Tend from your link"}
        </h1>
        <p className="mt-4 text-lg text-night-soft">
          {expired
            ? "Ask whoever set Tend up to send your link again. It's under Settings, next to your name."
            : "Whoever set Tend up sent everyone in the circle their own link. Open it on this phone or computer and you'll stay signed in here."}
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/start"
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-day px-6 text-lg font-bold text-night transition-colors duration-200 hover:bg-day/90"
          >
            Set up Tend for someone
            <ArrowRight aria-hidden size={20} />
          </Link>
          {examplesOn() && (
            <Link
              href="/demo"
              className="inline-flex min-h-14 items-center justify-center rounded-xl border-2 border-night-ink/30 px-6 text-lg font-bold hover:border-night-ink"
            >
              Try it with an example circle
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
