import type { Metadata } from "next";
import Link from "next/link";
import { getMembers, listCircles } from "@/lib/circle";
import { integrations } from "@/lib/setup";
import { personProps } from "@/lib/page-context";
import { PersonPicker } from "@/components/person-picker";
import { ResetDemo } from "@/components/reset-demo";
import { redirect } from "next/navigation";
import { examplesOn } from "@/lib/examples";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Try Tend" };

/**
 * The demo's own door, kept apart from the product: example circles anyone
 * can open as any of their people, and put back the way they started.
 */
export default async function Demo() {
  if (!examplesOn()) redirect("/");
  // Example circles carry a story; circles people set up themselves never show here.
  const circles = (await listCircles()).filter((c) => c.story);
  const all = await Promise.all(
    circles.map(async (c) => {
      const ms = await getMembers(c.id);
      const person = ms.find((m) => m.role === "care_recipient");
      const rest = ms.filter((m) => m.role !== "care_recipient");
      return { circle: c, people: [...(person ? [person] : []), ...rest].map((m) => ({ ...personProps(m), relation: m.relation })) };
    }),
  );
  // The second key on their own PayPal is Tend. The shared care pot is another way to use it.
  const main = all.filter((x) => !x.circle.potEnabled);
  const pot = all.filter((x) => x.circle.potEnabled);
  const i = integrations();
  const now = Date.now();

  return (
    <div className="min-h-dvh bg-enamel text-ink">
      <div className="mx-auto max-w-6xl px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-20 sm:px-8">
        <nav aria-label="Tend" className="flex items-center gap-4">
          <Link href="/" className="font-display text-[1.75rem] font-semibold tracking-[-0.01em]">
            Tend
          </Link>
          <span className="border-l border-rule-strong pl-4 text-xs font-bold text-ink-soft">Example circles</span>
        </nav>

        <h1 className="mt-10 max-w-3xl font-display text-[2.5rem] leading-[1.08] font-medium tracking-[-0.035em] sm:text-[3.25rem]">
          Tap anyone to see Tend through their eyes
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Each clock is someone&apos;s own time. A night face means they&apos;re probably asleep, so Tend asks whoever is awake. The people and their history are made up; the
          PayPal side is {i.paypal === "simulated" ? "simulated until keys are added" : "real sandbox money"}.
        </p>

        {main.map(({ circle, people }) => (
          <section key={circle.id} aria-labelledby={`c-${circle.id}`} className="mt-12 rounded-[2rem] bg-sea p-5 text-feature-ink sm:p-8">
            <h2 id={`c-${circle.id}`} className="font-display text-2xl font-semibold">
              {circle.name}
            </h2>
            <p className="mt-2 max-w-prose text-feature-ink">{circle.story}</p>
            <div className="mt-5 max-w-3xl">
              <PersonPicker people={people} initialNow={now} />
            </div>
          </section>
        ))}

        {pot.length > 0 && (
          <details className="mt-10 rounded-[2rem] bg-clay p-5 text-feature-ink sm:p-8">
            <summary className="min-h-12 cursor-pointer font-bold">Another way to use Tend: a family care pot</summary>
            <p className="mt-2 max-w-prose text-[0.9375rem] text-feature-ink">
              Some families pay for care together. Here the circle tops up a shared PayPal pot, Tend pays the pharmacy and the carer from it with PayPal Payouts, and splits the cost
              fairly with PayPal invoices.
            </p>
            {pot.map(({ circle, people }) => (
              <section key={circle.id} aria-labelledby={`c-${circle.id}`} className="mt-5">
                <h2 id={`c-${circle.id}`} className="font-display text-xl font-semibold">
                  {circle.name}
                </h2>
                <p className="mt-1 max-w-prose text-[0.9375rem] text-feature-ink">{circle.story}</p>
                <div className="mt-4 max-w-3xl">
                  <PersonPicker people={people} initialNow={now} />
                </div>
              </section>
            ))}
          </details>
        )}

        <section aria-labelledby="again" className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-rule pt-6">
          <h2 id="again" className="sr-only">
            Start again
          </h2>
          <p className="text-ink-soft">Made a mess? Put the example circles back the way they started.</p>
          <ResetDemo />
          <Link href="/setup" className="font-bold text-ink-soft underline underline-offset-4 hover:text-ink">
            What&apos;s connected
          </Link>
        </section>
      </div>
    </div>
  );
}
