import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-5">
      <p className="font-display text-[1.75rem] font-semibold text-accent">Tend</p>
      <h1 className="mt-6 font-display text-[2rem] leading-tight font-semibold">That page isn&apos;t here.</h1>
      <p className="mt-3 text-ink-soft">It may be a payment from before the demo was reset. Everything that happened is still in the passbook.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/home" className="inline-flex min-h-12 items-center rounded-xl bg-action px-5 font-bold text-action-ink">
          Go home
        </Link>
        <Link href="/passbook" className="inline-flex min-h-12 items-center rounded-xl border-2 border-rule-strong px-5 font-bold">
          Open the passbook
        </Link>
      </div>
    </main>
  );
}
