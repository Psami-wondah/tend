import Link from "next/link";
import { notFound } from "next/navigation";
import { paymentDetail } from "@/lib/views";
import { formatMoney } from "@/lib/money";
import { StatusPill } from "@/components/status";
import { Reasons } from "@/components/reasons";
import { ApprovalCard } from "@/components/approval-card";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const EVENT: Record<string, string> = {
  decided: "Tend checked it against the family's rules",
  approved: "Approved",
  rejected: "Declined",
  approval_threshold_met: "Enough approvals",
  payout_sent: "Sent to PayPal",
  payout_succeeded: "PayPal confirmed the payment",
  payout_failed: "PayPal rejected the payment",
  payment_failed: "Payment failed",
};

export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { id } = await params;
  const { as } = await searchParams;
  const d = await paymentDetail(id);
  if (!d) notFound();
  const me = d.family.find((m) => m.id === as) ?? d.family[0];
  const { intent } = d;
  const waiting = intent.status === "awaiting_approval" || intent.status === "on_hold";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href={`/?as=${me.id}`} className="font-bold underline underline-offset-4">
        Back to the care circle
      </Link>

      {waiting ? (
        <div className="mt-6">
          <ApprovalCard
            intent={intent}
            approvedBy={d.votes.filter((v) => v.verdict === "approve").map((v) => v.name)}
            myVote={d.votes.find((v) => v.memberId === me.id)?.verdict ?? null}
            memberId={me.id}
          />
        </div>
      ) : (
        <article className="mt-6 rounded-2xl border border-rule bg-sheet p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="figures text-4xl font-extrabold">{formatMoney(intent.amountMinor, intent.currency)}</p>
              <p className="text-xl font-bold">{intent.payeeName}</p>
            </div>
            <StatusPill status={intent.status} />
          </div>
          <p className="mt-2 text-ink-soft">{intent.summary}</p>
          {intent.failureReason && <p className="mt-3 font-bold text-brick">{intent.failureReason}</p>}
          <div className="mt-5 border-t border-rule pt-5">
            <Reasons reasons={intent.evaluation.reasons} />
          </div>
        </article>
      )}

      <section aria-labelledby="trail" className="mt-10">
        <h2 id="trail" className="mb-4 text-2xl font-extrabold">What happened</h2>
        <ol className="relative space-y-5 border-l-2 border-rule pl-6">
          {d.intake && (
            <li>
              <p className="font-bold">Sent in by {d.intake.source === "photo" ? "photo" : d.intake.source === "voice" ? "voice note" : "message"}</p>
              <p className="text-sm text-ink-soft">{timeFmt.format(d.intake.createdAt)}</p>
              {d.intake.imageDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.intake.imageDataUrl} alt="The document that was sent in" className="mt-3 max-h-72 rounded-xl border border-rule" />
              )}
              {d.intake.text && <blockquote className="mt-2 border-l-4 border-rule pl-3 italic">{d.intake.text}</blockquote>}
            </li>
          )}
          {d.trail.map((t) => (
            <li key={t.id}>
              <p className="font-bold">{EVENT[t.type] ?? t.type.replaceAll("_", " ")}</p>
              <p className="text-sm text-ink-soft">
                {timeFmt.format(t.createdAt)} by{" "}
                {t.actor === "agent" ? "Tend" : t.actor === "paypal" ? "PayPal" : d.votes.find((v) => `member:${v.memberId}` === t.actor)?.name ?? "family"}
              </p>
            </li>
          ))}
        </ol>
        {intent.paypalBatchId && (
          <p className="mt-6 text-sm text-ink-soft">
            PayPal payout batch <span className="figures font-bold">{intent.paypalBatchId}</span>
            {intent.paypalTransactionId && (
              <>
                , transaction <span className="figures font-bold">{intent.paypalTransactionId}</span>
              </>
            )}
          </p>
        )}
      </section>
    </main>
  );
}
