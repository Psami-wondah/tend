import Link from "next/link";
import { getMembers, listCircles } from "@/lib/circle";
import { integrations } from "@/lib/setup";
import { personProps } from "@/lib/page-context";
import { PersonPicker } from "@/components/person-picker";

export const dynamic = "force-dynamic";

// The same four stages every payment shows, at the same fixed scale.
const STAGES = [
  {
    stage: "Read",
    title: "They send it, AI reads it",
    body: "A photo of a bill, a voice note, or a text or PayPal email someone sent them. An AI model pulls out who's asking, how much, and any scam signals.",
  },
  {
    stage: "Rules",
    title: "Their circle's rules decide",
    body: "A rule book the circle wrote decides: pay, hold, ask, or refuse. Gift cards, crypto and wire transfers are refused outright. The AI never holds a tool that moves money.",
  },
  {
    stage: "Circle",
    title: "Time for a second look",
    body: "Anything unusual from their own PayPal is authorized but held for a day. Whoever is awake can stop it, and PayPal voids the hold. Nothing leaves until then.",
  },
  {
    stage: "PayPal",
    title: "PayPal pays, everyone sees it",
    body: "Released payments are captured and paid out by PayPal. Every decision explains itself, in each person's own time zone.",
  },
];

export default async function Welcome() {
  const circles = await listCircles();
  const withPeople = await Promise.all(
    circles.map(async (c) => {
      const ms = await getMembers(c.id);
      const person = ms.find((m) => m.role === "care_recipient");
      const rest = ms.filter((m) => m.role !== "care_recipient");
      return { circle: c, people: [...(person ? [person] : []), ...rest].map((m) => ({ ...personProps(m), relation: m.relation })) };
    }),
  );
  const i = integrations();
  const demo = i.paypal === "simulated" || !i.ai;
  const now = Date.now();

  return (
    <div className="min-h-dvh">
      <section className="on-night bg-night text-night-ink">
        <div className="mx-auto max-w-5xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="font-display text-[1.75rem] font-semibold tracking-[-0.01em]">Tend</span>
            {demo && (
              <Link href="/setup" className="rounded-full bg-day px-2.5 py-1 text-xs font-bold text-night">
                Demo mode
              </Link>
            )}
            <Link href="/setup" className="ml-auto text-sm font-bold text-night-soft underline decoration-night-soft/50 hover:text-night-ink">
              Setup
            </Link>
          </div>
          <h1 className="mt-10 max-w-3xl font-display text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.02em] text-balance sm:text-[3.5rem]">
            Their money, their say. A second key for the people they trust.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-night-soft">
            Americans over 60 reported <span className="figures text-night-ink">$7.75 billion</span> lost to fraud last year, up 59%. Tend lets an older adult keep paying from their own PayPal, and gives the people they trust time to stop anything that looks wrong. Built on PayPal, with AI that reads every request.
          </p>

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            {withPeople.map(({ circle, people }) => (
              <section key={circle.id} aria-labelledby={`c-${circle.id}`}>
                <h2 id={`c-${circle.id}`} className="font-display text-xl font-semibold">
                  {circle.name}
                </h2>
                {circle.story && <p className="mt-1 max-w-prose text-[0.9375rem] text-night-soft">{circle.story}</p>}
                <div className="mt-4">
                  <PersonPicker people={people} initialNow={now} />
                </div>
              </section>
            ))}
          </div>
          <p className="mt-6 text-sm text-night-soft">Demo circles: everyone here, and their history, is made-up seed data.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.01em]">
          How Tend decides
        </h2>
        <ol className="mt-6 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map(({ stage, title, body }, n) => (
            <li key={stage}>
              <span aria-hidden className="block h-1.5 rounded-full bg-night-cell" />
              <h3 className="mt-3 text-lg leading-snug font-bold">
                <span className="sr-only">Stage {n + 1}, </span>
                <span className="font-display font-semibold">{stage}.</span> {title}
              </h3>
              <p className="mt-1 text-ink-soft">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10 grid max-w-3xl gap-3 text-ink-soft">
          <p>
            In the UK, banks may now hold a suspicious payment for up to four business days, because time breaks scams. The people someone trusts have no such power over
            their payments. Tend gives it to them, using PayPal&apos;s own authorize-and-capture.
          </p>
          <p className="text-sm">
            Sources: FBI IC3 2025 report (losses reported by people 60+); UK Payment Services (Amendment) Regulations 2024 and FCA FG24/6. Details in the repo&apos;s
            STRATEGY.md.
          </p>
        </div>
      </section>
    </div>
  );
}
