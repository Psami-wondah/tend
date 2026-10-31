import Link from "next/link";
import { dashboard } from "@/lib/views";
import { formatMoney } from "@/lib/money";
import { ApprovalCard } from "@/components/approval-card";
import { Passbook } from "@/components/passbook";
import { MemberSwitcher } from "@/components/member-switcher";
import { TopUp } from "@/components/top-up";
import { ShareRequest } from "@/components/share-request";
import { AskTend } from "@/components/ask-tend";
import { SyncButton } from "@/components/sync-button";
import { Reasons } from "@/components/reasons";

export const dynamic = "force-dynamic";

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const d = await dashboard(as);
  const money = (m: number) => formatMoney(m, d.circle.currency);
  const needsMe = d.waiting.filter((w) => w.myVote !== "approve");

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-extrabold tracking-tight text-passbook">Tend</span>
          <span className="text-ink-soft">{d.circle.name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <MemberSwitcher members={d.family} current={d.me.id} />
          <Link href="/mum" className="min-h-10 rounded-lg border-2 border-passbook px-4 py-1.5 font-bold text-passbook">
            Open {d.circle.careRecipientName}&apos;s screen
          </Link>
        </div>
      </header>

      <section aria-labelledby="pot" className="rounded-3xl bg-passbook px-6 py-8 text-white sm:px-10">
        <h1 id="pot" className="text-lg font-bold text-white/80">
          In {d.circle.careRecipientName}&apos;s care pot
        </h1>
        <p className="figures mt-1 text-6xl font-extrabold tracking-tight sm:text-7xl">{money(d.balanceMinor)}</p>
        <p className="mt-2 text-white/80">
          {d.reservedMinor > 0 ? `${money(d.reservedMinor)} is set aside for payments going out now. ` : ""}
          {needsMe.length > 0
            ? `${needsMe.length} payment${needsMe.length > 1 ? "s" : ""} waiting for you, ${d.me.name}.`
            : `Nothing waiting for you, ${d.me.name}.`}
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/25 pt-5 sm:grid-cols-4">
          {d.contributedBy.map((c) => (
            <div key={c.member.id}>
              <dt className="text-sm text-white/75">{c.member.name} has put in</dt>
              <dd className="figures text-xl font-bold">{money(c.totalMinor)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-10">
          <section aria-labelledby="waiting">
            <h2 id="waiting" className="mb-4 text-2xl font-extrabold">Waiting for the family</h2>
            {d.waiting.length === 0 ? (
              <p className="rounded-2xl bg-sheet p-6 text-ink-soft">
                Nothing to approve. Tend is paying routine bills within the limits you agreed.
              </p>
            ) : (
              <div className="space-y-4">
                {d.waiting.map((w) => (
                  <ApprovalCard key={w.intent.id} intent={w.intent} approvedBy={w.approvals} myVote={w.myVote} memberId={d.me.id} />
                ))}
              </div>
            )}
          </section>

          {d.recentRefusals.length > 0 && (
            <section aria-labelledby="stopped">
              <h2 id="stopped" className="mb-4 text-2xl font-extrabold">What Tend stopped</h2>
              <div className="space-y-4">
                {d.recentRefusals.map((r) => (
                  <article key={r.id} className="rounded-2xl border-2 border-brick bg-brick-tint/40 p-5">
                    <p className="text-lg font-bold">
                      {money(r.amountMinor)} to {r.payeeName}
                    </p>
                    <p className="mb-3 text-ink-soft">{r.summary}</p>
                    <Reasons reasons={r.evaluation.reasons.filter((x) => x.effect === "refuse")} />
                  </article>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="passbook">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <h2 id="passbook" className="text-2xl font-extrabold">Passbook</h2>
              <SyncButton />
            </div>
            <Passbook rows={d.passbook} currency={d.circle.currency} asMemberId={d.me.id} />
          </section>
        </div>

        <aside className="space-y-10">
          <section aria-labelledby="ask">
            <h2 id="ask" className="mb-4 text-2xl font-extrabold">Ask Tend</h2>
            <AskTend memberId={d.me.id} />
          </section>

          <section aria-labelledby="topup">
            <h2 id="topup" className="mb-4 text-2xl font-extrabold">Top up the pot</h2>
            <TopUp memberId={d.me.id} currency={d.circle.currency} />
          </section>

          <section aria-labelledby="shares">
            <h2 id="shares" className="mb-2 text-2xl font-extrabold">Ask everyone to chip in</h2>
            <p className="mb-4 text-ink-soft">Tend sends each of you a PayPal invoice for an equal share.</p>
            <ShareRequest siblings={d.family.length} currency={d.circle.currency} />
          </section>

          {d.alerts.length > 0 && (
            <section aria-labelledby="alerts">
              <h2 id="alerts" className="mb-4 text-2xl font-extrabold">Recent</h2>
              <ul className="space-y-3">
                {d.alerts.map((a) => (
                  <li
                    key={a.id}
                    className={`rounded-xl border-l-4 bg-sheet px-4 py-3 ${
                      a.severity === "danger" ? "border-brick" : a.severity === "action" ? "border-marigold" : "border-passbook"
                    }`}
                  >
                    <p className="font-bold">{a.title}</p>
                    <p className="text-sm text-ink-soft">{a.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
