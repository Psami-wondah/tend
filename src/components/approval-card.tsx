"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaymentIntent } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { Reasons } from "./reasons";
import { StatusPill } from "./status";

export function ApprovalCard(props: {
  intent: PaymentIntent;
  approvedBy: string[];
  myVote: "approve" | "reject" | null;
  memberId: string;
}) {
  const { intent } = props;
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function vote(verdict: "approve" | "reject") {
    setBusy(verdict);
    setError(null);
    const res = await fetch(`/api/payments/${intent.id}/verdict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: props.memberId, verdict }),
    });
    setBusy(null);
    if (!res.ok) setError((await res.json()).error ?? "Couldn't record that.");
    router.refresh();
  }

  const remaining = Math.max(0, intent.approvalsRequired - props.approvedBy.length);

  return (
    <article className="rounded-2xl border-2 border-marigold bg-sheet p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="figures text-3xl font-extrabold">{formatMoney(intent.amountMinor, intent.currency)}</p>
          <p className="text-lg font-bold">{intent.payeeName}</p>
        </div>
        <StatusPill status={intent.status} />
      </div>
      <p className="mt-2 text-ink-soft">{intent.summary}</p>

      <div className="mt-4 border-t border-rule pt-4">
        <Reasons reasons={intent.evaluation.reasons} />
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        {props.approvedBy.length > 0 && <>Approved by {props.approvedBy.join(" and ")}. </>}
        {remaining > 0 ? `${remaining} more approval${remaining > 1 ? "s" : ""} needed.` : "Fully approved."}
      </p>

      {error && <p role="alert" className="mt-3 font-bold text-brick">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-3">
        {props.myVote === "approve" ? (
          <p className="font-bold text-passbook">You approved this.</p>
        ) : (
          <>
            <button
              onClick={() => vote("approve")}
              disabled={busy !== null}
              className="min-h-12 rounded-xl bg-passbook px-6 text-lg font-bold text-white hover:bg-passbook-deep disabled:opacity-60"
            >
              {busy === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              onClick={() => vote("reject")}
              disabled={busy !== null}
              className="min-h-12 rounded-xl border-2 border-rule px-6 text-lg font-bold hover:border-brick hover:text-brick disabled:opacity-60"
            >
              {busy === "reject" ? "Declining…" : "Decline"}
            </button>
          </>
        )}
        <Link href={`/payments/${intent.id}?as=${props.memberId}`} className="ml-auto self-center text-sm font-bold underline underline-offset-4">
          Full history
        </Link>
      </div>
    </article>
  );
}
