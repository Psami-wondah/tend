import type { Metadata } from "next";
import Link from "next/link";
import { StartWizard } from "@/components/start-wizard";

export const metadata: Metadata = { title: "Set up Tend" };

export default function StartPage() {
  return (
    <div className="min-h-dvh bg-enamel">
      <header className="on-night bg-night text-night-ink">
        <div className="mx-auto flex max-w-2xl items-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-6">
          <Link href="/" className="font-display text-[1.75rem] font-semibold tracking-[-0.01em]">
            Tend
          </Link>
          <span className="ml-auto text-sm text-night-soft">Takes about a minute</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8 pb-16 sm:px-6">
        <StartWizard />
      </main>
    </div>
  );
}
