import Link from "next/link";
import { ArrowRight, Ban, Bot, Clock3, KeyRound, Landmark, ScrollText } from "lucide-react";
import { getMember, getMembers, listCircles } from "@/lib/circle";
import { viewerId } from "@/lib/viewer";
import { integrations } from "@/lib/setup";
import { personProps } from "@/lib/page-context";
import { PersonPicker } from "@/components/person-picker";
import { HeroPhones, OUTCOMES, Verdict } from "@/components/landing";
import { examplesOn } from "@/lib/examples";

export const dynamic = "force-dynamic";

// The same four stages every payment shows, at the same fixed scale.
const STAGES = [
  {
    stage: "Read",
    title: "They send it, AI reads it",
    body: "A photo of a bill, a voice note, or a text or PayPal email someone sent them. AI pulls out who's asking, how much, and any scam signals.",
  },
  {
    stage: "Rules",
    title: "Their circle's rules decide",
    body: "A rule book the circle agreed decides: pay, hold, ask, or refuse. The same answer every time, with reasons in plain words.",
  },
  {
    stage: "Circle",
    title: "Time for a second look",
    body: "Anything unusual is authorized in their PayPal but held. Whoever is awake gets an alert and can stop it there and then.",
  },
  {
    stage: "PayPal",
    title: "PayPal pays, or nothing moves",
    body: "A yes, or the end of the hold, and PayPal captures and pays it. A stop, and PayPal voids the hold. The money never left.",
  },
];

const STATS = [
  { figure: "$7.75bn", line: "lost to fraud by Americans over 60 in 2025, up 59% in a year", source: "FBI IC3" },
  { figure: "$38,500", line: "the average loss for each older victim", source: "FBI IC3" },
  { figure: "26%", line: "of Americans 65 and over live alone, often with no one to ask", source: "Pew Research" },
  { figure: "4 days", line: "how long UK banks may now hold a suspicious payment, because time breaks scams", source: "FCA FG24/6" },
];

const PROMISES = [
  { Icon: KeyRound, title: "Their money stays theirs", body: "No joint account, no power of attorney. They pay from their own PayPal, and Tend only ever adds time." },
  { Icon: Landmark, title: "The hold is PayPal's own", body: "Unusual payments are authorized, not sent. Stopping one is a PayPal void, so there's nothing to claw back." },
  { Icon: Bot, title: "AI reads, rules decide", body: "AI reads bills and messages. It never holds a tool that moves money; the circle's rules make every call." },
  { Icon: Clock3, title: "Silence never pays", body: "A payment that needs a yes is cancelled after three days if nobody answers. Holds never outlast PayPal's own window." },
  { Icon: Ban, title: "Some things are always refused", body: "Gift cards, crypto, wire transfers, and anyone posing as family, a bank or a government office." },
  { Icon: ScrollText, title: "Everything explains itself", body: "Every decision shows its reasons and a timeline, stamped in each person's own time zone." },
];

const PAYPAL = ["Orders: authorize, capture, void", "JS SDK v6", "Vault", "Payouts", "Invoicing", "Agent Toolkit", "Webhooks"];

export default async function Welcome() {
  // The front shows the example circle for Tend itself; /demo has the rest, and a reset.
  const circles = examplesOn() ? (await listCircles()).filter((c) => c.story && !c.potEnabled) : [];
  const viewer = await viewerId().then((id) => (id ? getMember(id) : null));
  const yours = viewer ? (viewer.role === "care_recipient" ? "/me" : "/home") : null;
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
  // With the example circles off (live PayPal), there's nothing to try: the page is for setting Tend up.
  const tryIt = withPeople.length > 0;

  return (
    <div className="min-h-dvh">
      <section className="on-night relative overflow-hidden bg-night text-night-ink">
        <div className="relative mx-auto max-w-7xl px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-16 sm:px-8 lg:px-12 lg:pb-24">
          <nav aria-label="Tend" className="flex min-h-14 flex-wrap items-center gap-3 border-b border-night-ink/15 pb-5 sm:gap-6">
            <span className="inline-flex items-center gap-2.5 font-display text-[2rem] font-semibold tracking-[-0.04em]"><Clock3 aria-hidden size={27} strokeWidth={1.5} className="text-day" />Tend</span>
            {demo && (
              <Link href="/setup" className="inline-flex min-h-12 items-center rounded-full border border-night-ink/20 px-3 text-sm font-bold text-night-soft">
                Demo mode
              </Link>
            )}
            <div className="ml-auto hidden items-center gap-7 text-[0.9375rem] font-bold text-night-soft md:flex">
              <a href="#how" className="inline-flex min-h-12 items-center transition-colors hover:text-night-ink">
                How it works
              </a>
              <a href="#safety" className="inline-flex min-h-12 items-center transition-colors hover:text-night-ink">
                Safety
              </a>
              {tryIt && (
                <a href="#try" className="inline-flex min-h-12 items-center transition-colors hover:text-night-ink">
                  Try it
                </a>
              )}
            </div>
            <Link
              href={yours ?? "/start"}
              className="ml-auto inline-flex min-h-12 items-center rounded-full bg-night-ink px-5 text-[0.9375rem] font-bold text-night transition-colors hover:bg-white md:ml-0"
            >
              {yours ? "Open Tend" : "Set up Tend"}
            </Link>
          </nav>

          <div className="mt-12 grid items-center gap-12 sm:mt-16 lg:mt-20 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-14">
            <div>
              <p className="inline-flex items-center gap-2.5 text-[0.9375rem] font-bold text-night-soft before:size-1.5 before:rounded-full before:bg-day">For older adults, and the people they trust</p>
              <h1 className="mt-6 max-w-xl font-display font-medium tracking-[-0.045em] text-balance">
                <span className="block text-[3.35rem] leading-[1.02] sm:text-[4.5rem] lg:text-[5.25rem]">Their money,<br />their say.</span>{" "}<span className="mt-5 block max-w-md text-[1.9rem] leading-[1.16] tracking-[-0.025em] text-day sm:text-[2.2rem]">A second key for the people they trust.</span>
              </h1>
              <p className="mt-6 max-w-md text-[1.0625rem] leading-relaxed text-night-soft">
                Tend lets an older adult keep paying from their own PayPal. Anything unusual is held in their account until someone they trust has had a look, so a scam can be stopped
                before a cent leaves.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/start" className="inline-flex min-h-14 items-center gap-3 rounded-full bg-night-ink px-6 font-bold text-night transition-colors hover:bg-white">
                  Set up Tend for someone <ArrowRight aria-hidden size={18} />
                </Link>
                {tryIt && (
                  <a href="#try" className="inline-flex min-h-14 items-center rounded-full border border-night-ink/35 px-6 font-bold transition-colors hover:border-night-ink">
                    Try the demo
                  </a>
                )}
              </div>
            </div>
            <HeroPhones />
          </div>
        </div>
      </section>

      <section aria-label="Why it matters" className="border-b border-rule bg-dial">
        <dl className="mx-auto grid max-w-7xl gap-x-8 gap-y-8 px-5 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-12 lg:py-12">
          {STATS.map((s) => (
            <div key={s.figure} className="border-l-2 border-rule pl-5">
              <dt className="figures font-display text-[2.125rem] leading-none font-semibold tracking-[-0.01em]">{s.figure}</dt>
              <dd className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
                {s.line}. <span className="text-sm">({s.source})</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12 lg:py-24" aria-labelledby="how">
        <h2 id="how" className="max-w-3xl font-display text-[2.25rem] leading-[1.12] font-medium tracking-[-0.035em] sm:text-[3rem]">
          The usual fix takes their money away. Tend adds time.
        </h2>
        <p className="mt-5 max-w-2xl text-[1.0625rem] leading-relaxed text-ink-soft">
          A joint account, a power of attorney or a card someone else runs all take control from the person. Tend keeps them in charge and gives the people they trust one thing:
          time for a second look.
        </p>
        <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map(({ stage, title, body }, n) => (
            <li key={stage} className="border-t border-rule pt-5">
              <span aria-hidden className={`figures mb-6 inline-flex min-h-11 items-center text-lg ${n === 2 ? "text-wait" : n === 3 ? "text-paid" : "text-accent"}`}>{String(n + 1).padStart(2, "0")}</span>
              <h3 className="text-lg leading-snug font-bold">
                <span className="sr-only">Stage {n + 1}, </span>
                <span className="font-display font-semibold">{stage}.</span> {title}
              </h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">{body}</p>
            </li>
          ))}
        </ol>

        <h3 className="mt-16 font-display text-[1.75rem] leading-tight font-medium tracking-[-0.02em]">What Tend does with what Walter is sent</h3>
        <ul className="mt-6 divide-y divide-rule border-y border-rule">
          {OUTCOMES.map((o, n) => (
            <li key={n} className="grid gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1.2fr)_9.5rem_minmax(0,1.3fr)] sm:items-center sm:gap-6 sm:px-7 sm:py-6">
              <span className="font-bold">{o.ask}</span>
              <span>
                <Verdict tone={o.tone}>{o.verdict}</Verdict>
              </span>
              <span className="text-[0.9375rem] text-ink-soft">{o.why}</span>
            </li>
          ))}
        </ul>
      </section>

      {tryIt && (
      <section id="try" className="on-night relative overflow-hidden bg-night text-night-ink" aria-labelledby="try-h">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
          <h2 id="try-h" className="max-w-3xl font-display text-[2.25rem] leading-[1.12] font-medium tracking-[-0.035em] sm:text-[3rem]">
            Meet Walter&apos;s circle. Tap anyone to see Tend through their eyes.
          </h2>
          <p className="mt-5 max-w-2xl text-[1.0625rem] leading-relaxed text-night-soft">
            Each clock is someone&apos;s own time. A night face means they&apos;re probably asleep, so Tend asks whoever is awake. Everyone here, and their history, is made up for the
            demo; the PayPal side is real sandbox money{i.paypal === "simulated" ? " once keys are added" : ""}.
          </p>
          <div className="mt-12 grid max-w-4xl gap-10">
            {withPeople.map(({ circle, people }) => (
              <section key={circle.id} aria-labelledby={`c-${circle.id}`}>
                <h3 id={`c-${circle.id}`} className="font-display text-[1.75rem] font-medium tracking-[-0.02em]">
                  {circle.name}
                </h3>
                {circle.story && <p className="mt-2 max-w-prose text-base leading-relaxed text-night-soft">{circle.story}</p>}
                <div className="mt-6">
                  <PersonPicker people={people} initialNow={now} />
                </div>
              </section>
            ))}
          </div>
          <p className="mt-8 text-night-soft">
            <Link href="/demo" className="font-bold text-night-ink underline underline-offset-4">
              More examples
            </Link>
            , including a family that shares a care pot, and a way to start the demo again.
          </p>
        </div>
      </section>
      )}

      <section id="safety" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-12 lg:py-24" aria-labelledby="safety-h">
        <h2 id="safety-h" className="max-w-3xl font-display text-[2.25rem] leading-[1.12] font-medium tracking-[-0.035em] sm:text-[3rem]">
          Built so it can&apos;t become the problem
        </h2>
        <ul className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {PROMISES.map(({ Icon, title, body }) => (
            <li key={title} className="border-t border-rule pt-6">
              <span className="inline-flex min-h-12 items-center"><Icon aria-hidden size={25} strokeWidth={1.6} className="text-accent" /></span>
              <h3 className="mt-3 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-16 grid gap-8 border-y border-rule py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
          <div>
            <h3 className="font-display text-[1.75rem] leading-tight font-medium tracking-[-0.02em]">A second key for AI assistants, too</h3>
            <p className="mt-2 text-ink-soft">
              More people will ask an AI assistant to pay a bill for them. Tend is also an MCP server: any assistant can ask the circle&apos;s second key before it pays. It can check a
              request, see what&apos;s held, and stop a payment. It can never send one.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-2xl border border-night-ink/10 bg-night p-6 text-sm leading-relaxed text-night-ink">
            <code>{`check_payment_request("PayPal: invoice from
  Geek Squad, $499.99. Call
  +1 (808) 555-0199 to cancel.")

→ refuse: "PayPal never puts a support
   number in an invoice note."`}</code>
          </pre>
        </div>
      </section>

      <footer className="border-t border-rule bg-dial">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 lg:px-12 md:grid-cols-[minmax(0,1fr)_16rem] md:items-end">
          <div>
            <p className="font-display text-[2rem] font-semibold tracking-[-0.04em]">Tend</p>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">Built on PayPal, with AI reading every request, AG Studio for the circle&apos;s dashboard, and Render to run it.</p>
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="PayPal technology used">
              {PAYPAL.map((p) => (
                <li key={p} className="border-r border-rule pr-3 py-1 text-sm font-bold last:border-r-0">
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-bold text-ink-soft">
            <Link href="/start" className="inline-flex min-h-12 items-center underline decoration-rule-strong hover:text-ink">
              Set up Tend
            </Link>
            <Link href="/setup" className="inline-flex min-h-12 items-center underline decoration-rule-strong hover:text-ink">
              What&apos;s connected
            </Link>
            <span>Sources: FBI IC3 2025, Pew Research, FCA FG24/6</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
