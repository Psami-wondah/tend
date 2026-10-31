import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { alert, audit, getMember } from "../circle";
import { executeIntent, load, transition } from "./executor";
import type { PaymentIntent } from "../db/schema";

const { approvals, paymentIntents } = schema;

export class ApprovalError extends Error {}

/**
 * A family member approves or rejects a payment.
 * One "reject" stops it. Reaching the required number of approvals pays it.
 */
export async function recordVerdict(opts: {
  intentId: string;
  memberId: string;
  verdict: "approve" | "reject";
  note?: string;
}): Promise<PaymentIntent> {
  const db = await getDb();
  const intent = await load(opts.intentId);
  const member = await getMember(opts.memberId);

  if (!member || member.circleId !== intent.circleId) throw new ApprovalError("Not a member of this care circle.");
  if (member.role !== "owner" && member.role !== "sibling") {
    throw new ApprovalError("Only family members on the care circle can approve payments.");
  }
  if (intent.status !== "awaiting_approval" && intent.status !== "on_hold") {
    throw new ApprovalError(`This payment is already ${intent.status.replace("_", " ")}.`);
  }

  await db
    .insert(approvals)
    .values({ intentId: intent.id, memberId: member.id, verdict: opts.verdict, note: opts.note ?? null })
    .onConflictDoUpdate({
      target: [approvals.intentId, approvals.memberId],
      set: { verdict: opts.verdict, note: opts.note ?? null, createdAt: new Date() },
    });
  await audit(intent.circleId, `member:${member.id}`, opts.verdict === "approve" ? "approved" : "rejected", { note: opts.note }, intent.id);

  if (opts.verdict === "reject") {
    await transition(intent.id, intent.status, "rejected");
    await alert(intent.circleId, "info", `${member.name} declined ${intent.payeeName}`, opts.note ?? "No payment was made.", intent.id);
    return load(intent.id);
  }

  return maybeRelease(intent.id);
}

export async function approvalCount(intentId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.intentId, intentId), eq(approvals.verdict, "approve")));
  return rows.length;
}

/** If an intent has enough approvals, move it to "approved" and pay it. */
async function maybeRelease(intentId: string): Promise<PaymentIntent> {
  const intent = await load(intentId);
  const count = await approvalCount(intentId);
  if (count < intent.approvalsRequired) return intent;
  if (await transition(intentId, intent.status, "approved")) {
    await audit(intent.circleId, "agent", "approval_threshold_met", { count, required: intent.approvalsRequired }, intentId);
    return executeIntent(intentId);
  }
  return load(intentId);
}

/** After money arrives in the pot, retry anything that was waiting on funds. */
export async function releaseHolds(circleId: string) {
  const db = await getDb();
  const held = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circleId), eq(paymentIntents.status, "on_hold")))
    .orderBy(asc(paymentIntents.createdAt));
  for (const intent of held) {
    const count = await approvalCount(intent.id);
    if (count >= intent.approvalsRequired) {
      if (await transition(intent.id, "on_hold", "approved")) await executeIntent(intent.id);
    } else {
      await transition(intent.id, "on_hold", "awaiting_approval");
    }
  }
}
