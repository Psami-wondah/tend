import Link from "next/link";
import { ArrowRight, Ban, Bot, Clock3, KeyRound, Landmark, ScrollText } from "lucide-react";
import { getMember, getMembers, listCircles } from "@/lib/circle";
import { viewerId } from "@/lib/viewer";
import { integrations } from "@/lib/setup";
import { personProps } from "@/lib/page-context";
import { PersonPicker } from "@/components/person-picker";
import { HeroPhones, OUTCOMES, Verdict } from "@/components/landing";

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
  { Icon: Bot, title: "AI reads, rules decide", body: "The AI model reads bills and messages. It never holds a tool that moves money; the circle's rules make every call." },
  { Icon: Clock3, title: "Silence never pays", body: "A payment that needs a yes is cancelled after three days if nobody answers. Holds never outlast PayPal's own window." },
  { Icon: Ban, title: "Some things are always refused", body: "Gift cards, crypto, wire transfers, and anyone posing as family, a bank or a government office." },
  { Icon: ScrollText, title: "Everything explains itself", body: "Every decision shows its reasons and a timeline, stamped in each person's own time zone." },
];

const PAYPAL = ["Orders: authorize, capture, void", "JS SDK v6", "Vault", "Payouts", "Invoicing", "Agent Toolkit", "Webhooks"];

export default async function Welcome() {
  // The front shows the example circle for Tend itself; /demo has the rest, and a reset.
  const circles = (await listCircles()).filter((c) => c.story && !c.potEnabled);
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

  return (
    <div className="min-h-dvh">
      <section className="on-night overflow-hidden bg-night text-night-ink">
        <div className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-14 sm:px-6">
          <nav aria-label="Tend" className="flex items-center gap-5">
            <span className="font-display text-[1.75rem] font-semibold tracking-[-0.01em]">Tend</span>
            {demo && (
              <Link href="/setup" className="rounded-full bg-day px-2.5 py-1 text-xs font-bold text-night">
                Demo mode
              </Link>
            )}
            <div className="ml-auto hidden items-center gap-5 text-[0.9375rem] font-bold text-night-soft md:flex">
              <a href="#how" className="hover:text-night-ink">
                How it works
              </a>
              <a href="#safety" className="hover:text-night-ink">
                Safety
              </a>
              <a href="#try" className="hover:text-night-ink">
                Try it
              </a>
            </div>
            <Link
              href={yours ?? "/start"}
              className="ml-auto inline-flex min-h-10 items-center rounded-xl bg-night-ink px-4 text-sm font-bold text-night hover:bg-white md:ml-0"
            >
              {yours ? "Open Tend" : "Set up Tend"}
            </Link>
          </nav>

          <div className="mt-10 grid items-center gap-12 lg:mt-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
            <div>
              <p className="inline-flex rounded-full bg-night-ink/10 px-3 py-1 text-sm font-bold text-night-soft">For older adults, and the people they trust</p>
              <h1 className="mt-5 font-display text-[2.6rem] leading-[1.03] font-semibold tracking-[-0.02em] text-balance sm:text-[3.6rem]">
                Their money, their say. A second key for the people they trust.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-night-soft">
                Tend lets an older adult keep paying from their own PayPal. Anything unusual is held in their account until someone they trust has had a look, so a scam can be stopped
                before a cent leaves.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/start" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-day px-5 font-bold text-night hover:brightness-105">
                  Set up Tend for someone <ArrowRight aria-hidden size={18} />
                </Link>
                <a href="#try" className="inline-flex min-h-12 items-center rounded-xl border-2 border-night-ink/30 px-5 font-bold hover:border-night-ink">
                  Try the demo
                </a>
              </div>
            </div>
            <HeroPhones />
          </div>
        </div>
      </section>

      <section aria-label="Why it matters" className="border-b border-rule bg-dial">
        <dl className="mx-auto grid max-w-6xl gap-x-8 gap-y-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.figure}>
              <dt className="figures font-display text-[2.125rem] leading-none font-semibold tracking-[-0.01em]">{s.figure}</dt>
              <dd className="mt-2 text-[0.9375rem] text-ink-soft">
                {s.line}. <span className="text-sm">({s.source})</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] sm:text-[2.25rem]">
          The usual fix takes their money away. Tend adds time.
        </h2>
        <p className="mt-3 max-w-2xl text-ink-soft">
          A joint account, a power of attorney or a card someone else runs all take control from the person. Tend keeps them in charge and gives the people they trust one thing:
          time for a second look.
        </p>
        <ol className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map(({ stage, title, body }, n) => (
            <li key={stage}>
              <span aria-hidden className={`block h-1.5 rounded-full ${n === 2 ? "bg-wait" : n === 3 ? "bg-paid" : "bg-night-cell"}`} />
              <h3 className="mt-3 text-lg leading-snug font-bold">
                <span className="sr-only">Stage {n + 1}, </span>
                <span className="font-display font-semibold">{stage}.</span> {title}
              </h3>
              <p className="mt-1 text-ink-soft">{body}</p>
            </li>
          ))}
        </ol>

        <h3 className="mt-14 font-display text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">What Tend does with what Walter is sent</h3>
        <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-2xl bg-dial">
          {OUTCOMES.map((o, n) => (
            <li key={n} className="grid gap-2 px-4 py-3.5 sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.3fr)] sm:items-center sm:gap-5 sm:px-5">
              <span className="font-bold">{o.ask}</span>
              <span>
                <Verdict tone={o.tone}>{o.verdict}</Verdict>
              </span>
              <span className="text-[0.9375rem] text-ink-soft">{o.why}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="try" className="on-night bg-night text-night-ink" aria-labelledby="try-h">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="try-h" className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] sm:text-[2.25rem]">
            Meet Walter&apos;s circle. Tap anyone to see Tend through their eyes.
          </h2>
          <p className="mt-3 max-w-2xl text-night-soft">
            Each clock is someone&apos;s own time. A night face means they&apos;re probably asleep, so Tend asks whoever is awake. Everyone here, and their history, is made up for the
            demo; the PayPal side is real sandbox money{i.paypal === "simulated" ? " once keys are added" : ""}.
          </p>
          <div className="mt-10 grid max-w-3xl gap-10">
            {withPeople.map(({ circle, people }) => (
              <section key={circle.id} aria-labelledby={`c-${circle.id}`}>
                <h3 id={`c-${circle.id}`} className="font-display text-xl font-semibold">
                  {circle.name}
                </h3>
                {circle.story && <p className="mt-1 max-w-prose text-[0.9375rem] text-night-soft">{circle.story}</p>}
                <div className="mt-4">
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

      <section id="safety" className="mx-auto max-w-6xl px-4 py-14 sm:px-6" aria-labelledby="safety-h">
        <h2 id="safety-h" className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.01em] sm:text-[2.25rem]">
          Built so it can&apos;t become the problem
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROMISES.map(({ Icon, title, body }) => (
            <li key={title} className="rounded-2xl bg-dial p-5">
              <Icon aria-hidden size={26} className="text-accent" />
              <h3 className="mt-3 text-lg font-bold">{title}</h3>
              <p className="mt-1 text-[0.9375rem] text-ink-soft">{body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-12 grid gap-6 rounded-2xl bg-dial p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
          <div>
            <h3 className="font-display text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">A second key for AI assistants, too</h3>
            <p className="mt-2 text-ink-soft">
              More people will ask an AI assistant to pay a bill for them. Tend is also an MCP server: any assistant can ask the circle&apos;s second key before it pays. It can check a
              request, see what&apos;s held, and stop a payment. It can never send one.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-night p-4 text-sm leading-relaxed text-night-ink">
            <code>{`check_payment_request("PayPal: invoice from
  Geek Squad, $499.99. Call
  +1 (808) 555-0199 to cancel.")

→ refuse: "PayPal never puts a support
   number in an invoice note."`}</code>
          </pre>
        </div>
      </section>

      <footer className="border-t border-rule bg-dial">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <p className="font-display text-[1.5rem] font-semibold tracking-[-0.01em]">Tend</p>
            <p className="mt-2 text-[0.9375rem] text-ink-soft">Built on PayPal, with an AI model reading every request, AG Studio for the circle&apos;s dashboard, and Render to run it.</p>
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="PayPal technology used">
              {PAYPAL.map((p) => (
                <li key={p} className="rounded-full bg-enamel px-3 py-1 text-sm font-bold">
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-ink-soft">
            <Link href="/start" className="underline decoration-rule-strong hover:text-ink">
              Set up Tend
            </Link>
            <Link href="/setup" className="underline decoration-rule-strong hover:text-ink">
              What&apos;s connected
            </Link>
            <span>Sources: FBI IC3 2025, Pew Research, FCA FG24/6</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
