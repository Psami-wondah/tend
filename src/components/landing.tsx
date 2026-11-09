import { CircleCheck, Hourglass, OctagonX, PauseCircle, Volume2 } from "lucide-react";

/**
 * The front page's product shots, drawn in the app's own tokens rather than
 * screenshots, so they stay sharp and follow the theme: Walter's "Before you
 * pay" screen, and the alert that lands on Dolores's phone a moment later.
 */

function Phone({ children, label, className = "" }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <figure className={`w-[10.25rem] shrink-0 sm:w-[15rem] lg:w-[16rem] ${className}`}>
      <div className="rounded-[2.6rem] bg-night-deep p-[0.55rem] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.08)]">
        <div className="relative aspect-[9/19] overflow-hidden rounded-[2.1rem] text-[8.6px] sm:text-[12px] lg:text-[12.8px]">
          <span aria-hidden className="absolute top-[0.9em] left-1/2 z-10 h-[1.9em] w-[6.5em] -translate-x-1/2 rounded-full bg-black" />
          {children}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-night-soft">{label}</figcaption>
    </figure>
  );
}

export function HeroPhones() {
  return (
    <div className="flex items-start justify-center" aria-hidden>
      <Phone label="Walter, 84, in Tucson" className="relative z-10 mt-10">
        <div className="flex h-full flex-col bg-enamel px-[1.3em] pt-[3.6em] pb-[1.4em] text-ink">
          <div className="flex items-center gap-[0.5em]">
            <span className="font-display text-[1.7em] font-semibold text-action">Tend</span>
            <span className="ml-auto rounded-[0.6em] border-2 border-ink px-[0.5em] font-display text-[0.9em] font-semibold">AA</span>
            <span className="grid size-[2.2em] place-items-center rounded-[0.6em] border-2 border-ink">
              <Volume2 className="size-[1.3em]" />
            </span>
          </div>
          <div className="mt-[1.2em] rounded-[1.5em] border-[0.3em] border-action bg-dial p-[1.1em]">
            <PauseCircle className="size-[2.6em]" />
            <p className="mt-[0.4em] font-display text-[2em] leading-none font-semibold">Before you pay</p>
            <p className="mt-[0.6em] text-[1.08em] leading-snug">
              Approve it in PayPal. I&apos;ll hold the <span className="figures">$650.00</span> in your account until Priya or Dolores says yes.
            </p>
            <p className="mt-[0.6em] flex gap-[0.4em] text-[0.9em] leading-snug">
              <Hourglass className="mt-[0.15em] size-[1.2em] shrink-0 text-wait" />A stranger at the door, and pressure to pay today.
            </p>
          </div>
          <div className="mt-[0.8em] grid h-[3.4em] place-items-center rounded-full bg-[#ffc439] text-[1.05em] font-bold text-[#142c8e]">
            <span>
              Pay with <span className="italic">PayPal</span>
            </span>
          </div>
          <div className="mt-[0.6em] grid h-[3.2em] place-items-center rounded-[1.4em] border-2 border-ink bg-dial font-bold">Don&apos;t pay it</div>
        </div>
      </Phone>
      <Phone label="Dolores, next door" className="ml-2.5 sm:ml-5">
        <div className="on-night flex h-full flex-col items-center bg-[radial-gradient(120%_70%_at_50%_0%,var(--color-night-cell),var(--color-night-deep))] px-[0.9em] pt-[3.8em] text-night-ink">
          <p className="text-[0.95em] text-night-soft">Tuesday 10 November</p>
          <p className="figures font-display text-[4.4em] leading-none font-semibold">4:12</p>
          <div className="mt-[2.2em] w-full rounded-[1.3em] bg-night-ink/14 p-[0.9em] text-left backdrop-blur">
            <div className="flex items-center gap-[0.45em] text-[0.82em] text-night-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon-192.png" alt="" className="size-[1.6em] rounded-[0.4em]" />
              <span className="font-bold text-night-ink">Tend</span>
              <span className="ml-auto">now</span>
            </div>
            <p className="mt-[0.5em] text-[1.02em] leading-snug font-bold">
              Held: <span className="figures">$650.00</span> from Walter to Ridgeline Roofing
            </p>
            <p className="mt-[0.25em] text-[0.92em] leading-snug text-night-soft">A stranger at the door wants a deposit today. It waits until you or Priya says yes.</p>
          </div>
          <div className="mt-[0.45em] grid w-full grid-cols-2 gap-[0.45em] text-[0.98em] font-bold">
            <span className="rounded-[1em] bg-night-ink/14 py-[0.75em] text-center backdrop-blur">Stop it</span>
            <span className="rounded-[1em] bg-night-ink/14 py-[0.75em] text-center backdrop-blur">Say yes</span>
          </div>
        </div>
      </Phone>
    </div>
  );
}

const TONE = {
  paid: { cls: "bg-paid-tint text-paid", Icon: CircleCheck },
  wait: { cls: "bg-wait-tint text-wait", Icon: Hourglass },
  stop: { cls: "bg-stop-tint text-stop", Icon: OctagonX },
} as const;

/** What happens to six real-looking requests, from the same rules the app runs. */
export const OUTCOMES: { ask: React.ReactNode; tone: keyof typeof TONE; verdict: string; why: string }[] = [
  { ask: <>Pharmacy refill, <span className="figures">$38.20</span></>, tone: "paid", verdict: "Paid", why: "He's paid this pharmacy before, and it's small." },
  { ask: <>A plumber he booked himself, <span className="figures">$120</span></>, tone: "wait", verdict: "Held for a day", why: "Someone new. Priya or Dolores can stop it, or let it go now." },
  { ask: <>A roofer at the door wants <span className="figures">$650</span> today</>, tone: "wait", verdict: "Waits for a yes", why: "A stranger and pressure to pay. It might be real, so someone checks first." },
  { ask: <>&ldquo;Medicare&rdquo; wants an <span className="figures">$89</span> card fee</>, tone: "stop", verdict: "Refused", why: "Someone posing as Medicare, which never charges for a card." },
  { ask: <>A real PayPal invoice with a phone number in the note</>, tone: "stop", verdict: "Refused", why: "PayPal never puts a support number there. The scammer answers it." },
  { ask: <>&ldquo;It&apos;s me. Buy gift cards, don&apos;t tell anyone&rdquo;</>, tone: "stop", verdict: "Refused", why: "Gift cards, secrecy, and someone posing as family." },
];

export function Verdict({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold whitespace-nowrap ${t.cls}`}>
      <t.Icon aria-hidden size={15} strokeWidth={2.5} />
      {children}
    </span>
  );
}
