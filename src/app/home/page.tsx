import Link from "next/link";
import { settleDueHolds } from "@/lib/own-payments";
import type { Metadata } from "next";
import { dashboard } from "@/lib/views";
import { familyContext, personProps } from "@/lib/page-context";
import { Shell } from "@/components/shell";
import { ClockRow, DayBand } from "@/components/clock";
import { ApprovalCard } from "@/components/approval-card";
import { HeldCard } from "@/components/held-card";
import { MyShare, RecoveryCard, ScanButton, ShareRequest, TopUp, WaitingForPayPal } from "@/components/money-actions";
import { Fairness, OwnRows, RecentRows, Stopped } from "@/components/home-parts";
import { Money, SectionHeading } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { Txt } from "@/components/figures-text";
import { AlertsToggle } from "@/components/alerts-toggle";
import { isFamily } from "@/lib/people";
import { GettingStarted } from "@/components/getting-started";
import { activeMandate, listPayees } from "@/lib/circle";
import { holdFor } from "@/lib/time";
import { inviteLink } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Home" };

export default async function CircleHome() {
  // Holds whose time is up go (or lapse) now, even without the cron job.
  await settleDueHolds().catch(() => undefined);
  const ctx = await familyContext();
  const d = await dashboard(ctx.me.id);
  const money = (m: number) => formatMoney(m, d.circle.currency);
  const people = ctx.clockPeople.map(personProps);
  const mine = d.waiting.filter((w) => w.myVote !== "approve");
  const others = d.waiting.filter((w) => w.myVote === "approve");
  const waitingTotal = d.waiting.reduce((a, w) => a + w.intent.amountMinor, 0);
  const available = d.balanceMinor - d.reservedMinor;
  const person = ctx.mum;
  const who = d.circle.careRecipientName;
  const nothingWaiting = mine.length === 0 && d.held.length === 0;
  // A circle that was just set up: no payments yet, so show the first steps.
  const isNew = !d.circle.potEnabled && d.ownRecent.length === 0 && d.stopped.length === 0 && d.held.length === 0;
  const payeeCount = isNew ? (await listPayees(d.circle.id)).length : 0;
  const hold = holdFor((await activeMandate(d.circle.id)).ownPayments?.coolingOffHours ?? 24);
  const personLink = isNew && person ? await inviteLink(person.id) : "";

  return (
    <Shell
      me={personProps(ctx.me)}
      demo={ctx.demo}
      band={
        <div className="mt-6 grid gap-6 pb-2 md:grid-cols-[1fr_minmax(0,22rem)] md:items-end">
          {d.circle.potEnabled ? (
            <div>
              <h1 className="summary-title mb-3 text-base font-bold text-night-soft">{who}&apos;s care pot</h1>
              <Money minor={available} currency={d.circle.currency} size="xl" className="block" />
              <p className="mt-4 max-w-lg text-base leading-relaxed text-night-soft">
                <Txt>
                  {`In ${who}'s care pot${d.reservedMinor > 0 ? `, with ${money(d.reservedMinor)} on its way out` : ""}${
                    waitingTotal > 0 ? `. ${money(waitingTotal)} is waiting on the circle.` : "."
                  }${d.heldMinor > 0 ? ` ${money(d.heldMinor)} of ${who}'s own money is held.` : ""}`}
                </Txt>
              </p>
            </div>
          ) : (
            <div>
              <h1 className="summary-title mb-3 text-base font-bold text-night-soft">Protecting {who}&apos;s PayPal</h1>
              <Money minor={d.keptMinor} currency={d.circle.currency} size="xl" className="block" />
              <p className="mt-4 max-w-lg text-base leading-relaxed text-night-soft">
                <Txt>
                  {`Kept in ${who}'s account this month: payments the circle stopped and scams Tend refused.${
                    d.held.length ? ` ${money(d.heldMinor)} held right now.` : " Nothing held right now."
                  }`}
                </Txt>
              </p>
            </div>
          )}
          <div className="pb-1">
            <p className="mb-3 text-[0.9375rem] text-night-soft">Everyone’s local day</p>
            <DayBand people={people} initialNow={ctx.now} />
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="The circle's clocks" className="color-scene rounded-[2rem] border border-feature-ink/10 bg-sea px-4 py-7 text-feature-ink shadow-[0_14px_32px_-22px_rgb(19_58_71/0.5)] lg:col-start-2 lg:row-start-1">
          <p className="mb-6 text-center font-display text-xl font-semibold tracking-[-0.02em]">A little closer, wherever you are</p>
          <ClockRow people={people} initialNow={ctx.now} viewerId={ctx.me.id} />
        </section>

        <div className="space-y-10 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {d.payingCount > 0 && <WaitingForPayPal />}
          {isNew && person && isFamily(ctx.me) && <GettingStarted person={who} link={personLink} payees={payeeCount} />}

          <section aria-labelledby="waiting" className={nothingWaiting ? "rounded-3xl border border-rule bg-dial p-5 shadow-[0_10px_28px_-22px_rgb(25_47_57/0.3)] sm:p-7" : undefined}>
            <SectionHeading id="waiting">{nothingWaiting ? "Nothing waiting on you" : "Waiting on you"}</SectionHeading>
            {nothingWaiting ? (
              <p className="max-w-prose leading-relaxed text-ink-soft">
                {d.circle.potEnabled
                  ? `Tend is paying routine bills within the limits you agreed. Anything bigger or unusual, from the pot or from ${who}'s own PayPal, will appear here.`
                  : `${who} pays ordinary bills from their own PayPal. Anything unusual is held there ${hold} and appears here, so you can look before it goes.`}
              </p>
            ) : (
              <div className="space-y-4">
                {d.held.map((h) => (
                  <HeldCard
                    key={h.id}
                    intent={h}
                    payer={person ? personProps(person) : null}
                    me={personProps(ctx.me)}
                    circle={ctx.family.map(personProps)}
                    initialNow={ctx.now}
                  />
                ))}
                {mine.map((w) => (
                  <ApprovalCard
                    key={w.intent.id}
                    intent={w.intent}
                    approvals={w.approvals}
                    myVote={w.myVote}
                    me={personProps(ctx.me)}
                    family={ctx.family.map(personProps)}
                    initialNow={ctx.now}
                    compact
                  />
                ))}
              </div>
            )}
          </section>

          {others.length > 0 && (
            <section aria-labelledby="others">
              <SectionHeading id="others">Waiting on the others</SectionHeading>
              <div className="space-y-4">
                {others.map((w) => (
                  <ApprovalCard
                    key={w.intent.id}
                    intent={w.intent}
                    approvals={w.approvals}
                    myVote={w.myVote}
                    me={personProps(ctx.me)}
                    family={ctx.family.map(personProps)}
                    initialNow={ctx.now}
                    compact
                  />
                ))}
              </div>
            </section>
          )}

          {d.myPendingShares.map((c) => (
            <MyShare key={c.id} c={c} memberId={ctx.me.id} />
          ))}

          {d.recoveries.length > 0 && (
            <section aria-labelledby="recover">
              <SectionHeading id="recover">Money to get back</SectionHeading>
              <div className="space-y-4">
                {d.recoveries.map((r) => (
                  <RecoveryCard key={r.id} r={r} memberId={ctx.me.id} simulated={ctx.integrations.paypal === "simulated"} />
                ))}
              </div>
            </section>
          )}

          {d.stopped.length > 0 && (
            <section aria-labelledby="stopped">
              <SectionHeading id="stopped">What was stopped</SectionHeading>
              <Stopped intents={d.stopped} members={ctx.members.map((m) => ({ id: m.id, name: m.name }))} />
            </section>
          )}

          {d.circle.potEnabled ? (
            <section aria-labelledby="recent">
              <SectionHeading
                id="recent"
                action={
                  <Link href="/passbook" className="inline-flex min-h-12 items-center text-sm font-bold text-ink-soft underline decoration-rule-strong hover:text-ink">
                    Open the passbook
                  </Link>
                }
              >
                Recent from the pot
              </SectionHeading>
              <RecentRows rows={d.passbook.slice(0, 6)} currency={d.circle.currency} />
              <div className="mt-2">
                <ScanButton />
              </div>
            </section>
          ) : null}

          {d.ownRecent.length > 0 && (
            <section aria-labelledby="own">
              <SectionHeading
                id="own"
                action={
                  <Link href="/passbook" className="inline-flex min-h-12 items-center text-sm font-bold text-ink-soft underline decoration-rule-strong hover:text-ink">
                    All payments
                  </Link>
                }
              >
                {who}&apos;s own payments
              </SectionHeading>
              <OwnRows intents={d.ownRecent} />
            </section>
          )}
        </div>

        <div className="space-y-8 lg:col-start-2 lg:row-start-2">
          {isFamily(ctx.me) && <AlertsToggle memberId={ctx.me.id} person={who} />}
          {d.circle.potEnabled && (
            <>
              <section aria-labelledby="fair">
                <SectionHeading id="fair">Who&apos;s put in what</SectionHeading>
                <div className="rounded-3xl border border-rule bg-dial p-5 sm:p-6">
                  <Fairness rows={d.contributedBy} currency={d.circle.currency} />
                </div>
              </section>

              <section aria-labelledby="topup">
                <SectionHeading id="topup">Top up the pot</SectionHeading>
                <div className="rounded-3xl border border-rule bg-dial p-5 sm:p-6">
                  <TopUp memberId={ctx.me.id} currency={d.circle.currency} homeCurrency={ctx.me.homeCurrency} mode={ctx.integrations.paypal} />
                </div>
              </section>

              <section aria-labelledby="chipin">
                <SectionHeading id="chipin">Ask everyone to chip in</SectionHeading>
                <div className="rounded-3xl border border-rule bg-dial p-5 sm:p-6">
                  <p className="mb-3 text-[0.9375rem] text-ink-soft">
                    Tend sends each of you a PayPal invoice for an equal share.
                    {d.pendingShareCount > 0 ? ` ${d.pendingShareCount} still open.` : ""}
                  </p>
                  <ShareRequest family={d.family.length} currency={d.circle.currency} />
                </div>
              </section>
            </>
          )}

          {!d.circle.potEnabled && (
            <section aria-labelledby="how" className="rounded-3xl border border-rule bg-dial p-5 sm:p-6">
              <h2 id="how" className="font-display text-[1.375rem] leading-tight font-semibold">How the second key works</h2>
              <ul className="mt-5 space-y-4 text-[0.9375rem] leading-relaxed">
                <li>
                  <span className="font-bold">Ordinary bills</span> to people {who} has paid before go straight through.
                </li>
                <li>
                  <span className="font-bold">Anything unusual</span> (someone new, a big amount, warning signs) is held in {who}&apos;s PayPal {hold}. Anyone in the circle can stop it, and PayPal voids the hold.
                </li>
                <li>
                  <span className="font-bold">Gift cards, crypto, wire transfers</span> and clear scams are refused before any money moves.
                </li>
              </ul>
              <Link href="/rules" className="mt-4 inline-flex min-h-12 items-center text-sm font-bold underline">
                Change how long Tend holds things
              </Link>
            </section>
          )}
        </div>
      </div>
    </Shell>
  );
}
