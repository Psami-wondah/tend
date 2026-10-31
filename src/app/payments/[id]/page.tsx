import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Bot, Camera, Landmark, Mic, MessageSquareText } from "lucide-react";
import { paymentDetail } from "@/lib/views";
import { familyContext, personProps } from "@/lib/page-context";
import { formatMoney } from "@/lib/money";
import { stampIn } from "@/lib/time";
import { personVar } from "@/lib/people";
import { categoryLabel } from "@/lib/mandate/edit";
import { Shell } from "@/components/shell";
import { ApprovalCard } from "@/components/approval-card";
import { HeldCard } from "@/components/held-card";
import { Reasons, Stages } from "@/components/reasons";
import { Money, SimTag, StatusBadge, SectionHeading } from "@/components/ui";
import type { Member } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment" };

const EVENT: Record<string, string> = {
  intake_read: "Tend read it",
  decided: "Tend checked it against the family's rules",
  reevaluated: "Tend checked it again",
  approved: "Approved",
  rejected: "Declined",
  approval_threshold_met: "Enough of the family said yes",
  payee_attached: "Added the payee",
  payout_sent: "Sent to PayPal",
  payout_succeeded: "PayPal confirmed the payment",
  payout_failed: "PayPal rejected the payment",
  payment_failed: "Payment failed",
  duplicate_found: "Tend spotted it was paid twice",
  recovery_requested: "Asked the payee for the money back",
  recovery_dismissed: "The family said it was right",
  recovery_paid: "The payee paid it back",
  authorized: "PayPal authorized it: the money is held, not sent",
  held: "Tend held it for the circle to look",
  released: "Released: captured and sent",
  stopped: "Stopped it: PayPal voided the hold",
  expired: "Nobody said yes in time, so the hold was cancelled",
  vault_charge: "Paid from the saved PayPal they agreed to",
  authorization_voided: "PayPal voided the hold",
  capture_completed: "PayPal confirmed the capture",
};

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ctx, d] = await Promise.all([familyContext(), paymentDetail(id)]);
  if (!d) notFound();
  const { intent } = d;
  const waiting = intent.status === "awaiting_approval" || intent.status === "on_hold";
  const byId = (memberId: string) => d.members.find((m) => m.id === memberId);
  const actor = (a: string): Member | null => (a.startsWith("member:") ? byId(a.slice(7)) ?? null : null);
  const submitter = d.intake?.submittedBy ? byId(d.intake.submittedBy) : d.members.find((m) => m.role === "care_recipient");
  const decided = d.trail.find((t) => t.type === "decided")?.data as { awake?: string[]; asleep?: { name: string; city: string | null; local: string }[] } | undefined;
  const own = intent.funding === "own";
  const payer = intent.payerId ? byId(intent.payerId) : null;
  const stopper = intent.stoppedBy ? byId(intent.stoppedBy) : null;
  const stoppedNote = (d.trail.find((t) => t.type === "stopped")?.data as { note?: string } | undefined)?.note;

  return (
    <Shell
      me={personProps(ctx.me)}
      people={ctx.members.map(personProps)}
      demo={ctx.demo}
      band={
        <div className="mt-5">
          <Link href="/home" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-night-soft hover:text-night-ink">
            <ArrowLeft aria-hidden size={16} /> Home
          </Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Money minor={intent.amountMinor} currency={intent.currency} size="xl" className="block" />
              <h1 className="mt-2 text-xl font-bold">
                {intent.payeeName}
                <span className="font-normal text-night-soft">, {categoryLabel(intent.category).toLowerCase()}</span>
              </h1>
            </div>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-8">
          {own && intent.status === "held" && (
            <HeldCard intent={intent} payer={payer ? personProps(payer) : null} me={personProps(ctx.me)} circle={ctx.family.map(personProps)} initialNow={ctx.now} />
          )}

          {own && intent.status === "voided" && (
            <p className="rounded-2xl bg-dial p-4">
              <span className="font-bold">{stopper?.name ?? "Someone"} stopped it. </span>
              PayPal voided the hold, so the money never left {payer?.name ?? "their"}&apos;s account.
              {stoppedNote ? ` "${stoppedNote}"` : ""}
            </p>
          )}

          {waiting ? (
            <ApprovalCard
              intent={intent}
              approvals={d.votes.filter((v) => v.verdict === "approve").map((v) => ({ memberId: v.memberId, name: v.name, at: v.createdAt }))}
              myVote={d.votes.find((v) => v.memberId === ctx.me.id)?.verdict ?? null}
              me={personProps(ctx.me)}
              family={ctx.family.map(personProps)}
              initialNow={ctx.now}
              showLink={false}
            />
          ) : (
            <article className="rounded-2xl bg-dial p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <StatusBadge status={intent.status} />
                {intent.reference && <span className="figures text-sm text-ink-soft">Ref {intent.reference}</span>}
              </div>
              <p className="mt-3 text-lg">{intent.summary}</p>
              <div className="mt-4">
                <Stages status={intent.status} decision={intent.decision} approvalsRequired={intent.approvalsRequired} />
              </div>
              {intent.failureReason && <p className="mt-4 rounded-lg bg-stop-tint px-3 py-2 font-bold text-stop">{intent.failureReason}</p>}
              <div className="mt-5 border-t border-rule pt-4">
                <h2 className="mb-2.5 font-bold">Why Tend decided this</h2>
                <Reasons reasons={intent.evaluation.reasons} />
                <p className="mt-3 text-sm text-ink-soft">Checked against version {intent.evaluation.mandateVersion} of the family&apos;s rules.</p>
              </div>
            </article>
          )}

          {d.recovery && (
            <p className="rounded-2xl bg-accent/10 p-4">
              <span className="font-bold">This was a double payment. </span>
              {d.recovery.status === "found" && "Ask for it back from the home screen."}
              {d.recovery.status === "requested" && <>Tend asked {d.recovery.payeeName} for it back. <SimTag id={d.recovery.paypalInvoiceId} /></>}
              {d.recovery.status === "recovered" && `${d.recovery.payeeName} paid it back into the pot.`}
              {d.recovery.status === "dismissed" && "The family said it was right."}
            </p>
          )}

          <section aria-labelledby="trail">
            <SectionHeading id="trail">What happened</SectionHeading>
            <ol className="relative space-y-0 rounded-2xl bg-dial p-4 sm:p-5">
              {d.intake && (
                <TimelineItem
                  dot={submitter ? personVar(submitter) : "var(--color-brass)"}
                  Icon={d.intake.source === "photo" ? Camera : d.intake.source === "voice" ? Mic : MessageSquareText}
                  title={`${submitter?.name ?? "Someone"} sent ${d.intake.source === "photo" ? "a photo" : d.intake.source === "voice" ? "a voice note" : "a message"}`}
                  when={stampIn(submitter?.timezone, d.intake.createdAt)}
                  where={submitter?.city}
                  you={submitter?.id !== ctx.me.id ? stampIn(ctx.me.timezone, d.intake.createdAt) : null}
                >
                  {d.intake.imageDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.intake.imageDataUrl} alt="The document that was sent in" className="mt-3 max-h-80 rounded-xl border border-rule" />
                  )}
                  {d.intake.text && <blockquote className="mt-2 rounded-xl bg-enamel px-3.5 py-2.5 text-[0.9375rem]">{d.intake.text}</blockquote>}
                </TimelineItem>
              )}
              {d.trail.map((t) => {
                const who = actor(t.actor);
                const label = EVENT[t.type] ?? t.type.replaceAll("_", " ");
                return (
                  <TimelineItem
                    key={t.id}
                    dot={who ? personVar(who) : t.actor === "paypal" ? "var(--color-accent)" : "var(--color-night)"}
                    Icon={who ? null : t.actor === "paypal" ? Landmark : Bot}
                    title={who ? `${who.name}: ${label.toLowerCase()}` : `${t.actor === "paypal" ? "PayPal" : "Tend"}: ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
                    when={stampIn(who?.timezone ?? ctx.me.timezone, t.createdAt)}
                    where={who ? who.city : null}
                    you={who && who.id !== ctx.me.id ? stampIn(ctx.me.timezone, t.createdAt) : null}
                  >
                    {t.type === "decided" && decided?.asleep && decided.asleep.length > 0 && (
                      <p className="mt-1 text-[0.9375rem] text-ink-soft">
                        {decided.awake?.length ? `${decided.awake.join(" and ")} ${decided.awake.length > 1 ? "were" : "was"} awake. ` : ""}
                        {decided.asleep.map((a) => `${a.name} was asleep (${a.local} in ${a.city})`).join("; ")}.
                      </p>
                    )}
                    {typeof (t.data as { note?: string }).note === "string" && (t.data as { note?: string }).note && (
                      <p className="mt-1 text-[0.9375rem]">&ldquo;{(t.data as { note: string }).note}&rdquo;</p>
                    )}
                  </TimelineItem>
                );
              })}
            </ol>
            {intent.paypalBatchId && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                PayPal payout <span className="figures text-ink">{intent.paypalBatchId}</span>
                {intent.paypalTransactionId && (
                  <>
                    , transaction <span className="figures text-ink">{intent.paypalTransactionId}</span>
                  </>
                )}
                <SimTag id={intent.paypalBatchId} />
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-3 text-[0.9375rem]">
          <dl className="divide-y divide-rule rounded-2xl bg-dial">
            <Row label="Amount" value={formatMoney(intent.amountMinor, intent.currency)} figures />
            <Row label="Category" value={categoryLabel(intent.category)} />
            <Row label="How" value={intent.method === "paypal" ? "PayPal" : intent.method.replace("_", " ")} />
            <Row label="From" value={own ? `${payer?.name ?? "Their"}'s own PayPal` : "The shared pot"} />
            {own && intent.holdUntil && intent.status === "held" && <Row label="Held until" value={stampIn(ctx.me.timezone, intent.holdUntil)} />}
            {intent.paypalAuthorizationId && <Row label="Authorization" value={intent.paypalAuthorizationId} figures />}
            {intent.reference && <Row label="Reference" value={intent.reference} figures />}
            <Row label="Approvals needed" value={String(intent.approvalsRequired)} />
          </dl>
        </aside>
      </div>
    </Shell>
  );
}

function Row({ label, value, figures }: { label: string; value: string; figures?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={`text-right font-bold ${figures ? "figures font-medium" : ""}`}>{value}</dd>
    </div>
  );
}

function TimelineItem({
  dot,
  Icon,
  title,
  when,
  where,
  you,
  children,
}: {
  dot: string;
  Icon: typeof Bot | null;
  title: string;
  when: string;
  where?: string | null;
  you?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0 [&:last-child>span:first-child]:hidden">
      <span aria-hidden className="absolute top-7 bottom-0 left-[13px] w-0.5 bg-rule" />
      <span aria-hidden className="relative z-10 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-white" style={{ background: dot }}>
        {Icon && <Icon size={14} strokeWidth={2.5} />}
      </span>
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        <p className="text-sm text-ink-soft">
          <span className="figures">{when}</span>
          {where ? ` in ${where}` : ""}
          {you ? (
            <span>
              , <span className="figures">{you}</span> for you
            </span>
          ) : null}
        </p>
        {children}
      </div>
    </li>
  );
}
