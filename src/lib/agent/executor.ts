import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { formatMoney } from "../money";
import { getPayoutBatch, isSimulatedId, sendPayout, PayPalError } from "../paypal/rest";
import { alert, audit, potBalanceMinor, reservedMinor } from "../circle";
import type { IntentStatus, PaymentIntent } from "../db/schema";

const { paymentIntents, payees, ledgerEntries } = schema;

/**
 * The ONLY code path in Tend that sends money out of the pot.
 *
 * It runs only for intents in status "approved" — reached either by the
 * mandate engine (auto_pay) or by enough family approvals. The status flip
 * approved → paying is a conditional UPDATE, so two callers racing (a webhook
 * and a button press, say) can't both pay.
 */
export async function executeIntent(intentId: string): Promise<PaymentIntent> {
  const db = await getDb();
  const intent = await load(intentId);
  if (intent.status !== "approved") return intent;

  // Funds are checked again here: the pot may have changed since the decision.
  const available = (await potBalanceMinor(intent.circleId)) - ((await reservedMinor(intent.circleId)) - intent.amountMinor);
  if (intent.amountMinor > available) {
    await transition(intentId, "approved", "on_hold");
    await alert(
      intent.circleId,
      "action",
      "Top-up needed",
      `${intent.payeeName} (${formatMoney(intent.amountMinor, intent.currency)}) is approved but the pot only has ${formatMoney(available, intent.currency)}.`,
      intentId,
    );
    return load(intentId);
  }

  if (!intent.payeeId) {
    await fail(intent, "No verified payee is attached to this payment.");
    return load(intentId);
  }
  const [payee] = await db.select().from(payees).where(eq(payees.id, intent.payeeId));
  if (!payee?.verified) {
    await fail(intent, "Payee isn't verified.");
    return load(intentId);
  }
  const claimed = await transition(intentId, "approved", "paying");
  if (!claimed) return load(intentId); // someone else got there first

  try {
    const payout = await sendPayout({
      intentId,
      receiverEmail: payee.paypalEmail,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      note: `Tend · ${intent.summary}${intent.reference ? ` · Ref ${intent.reference}` : ""}`,
    });
    await db
      .update(paymentIntents)
      .set({ paypalBatchId: payout.batchId, updatedAt: new Date() })
      .where(eq(paymentIntents.id, intentId));
    const sim = isSimulatedId(payout.batchId);
    await audit(intent.circleId, "agent", "payout_sent", { ...payout, to: payee.paypalEmail, simulated: sim }, intentId);

    // Sandbox payouts usually settle in a few seconds; check briefly so the
    // demo shows "Paid", and let the webhook / refresh catch slower ones.
    for (let i = 0; i < 4; i++) {
      if (!sim) await new Promise((r) => setTimeout(r, 1500));
      const after = await refreshPayout(intentId);
      if (after.status !== "paying") return after;
    }
  } catch (err) {
    const reason = err instanceof PayPalError ? err.body : String(err);
    // Release the claim so the family can retry after fixing the cause.
    await db
      .update(paymentIntents)
      .set({ status: "failed", failureReason: reason.slice(0, 1000), updatedAt: new Date() })
      .where(and(eq(paymentIntents.id, intentId), eq(paymentIntents.status, "paying")));
    await audit(intent.circleId, "paypal", "payout_failed", { reason: reason.slice(0, 1000) }, intentId);
    await alert(intent.circleId, "danger", "Payment failed", `Paying ${intent.payeeName} failed. ${reason.slice(0, 200)}`, intentId);
  }
  return load(intentId);
}

/** Ask PayPal where a payout is, and settle the intent if it's done. */
export async function refreshPayout(intentId: string): Promise<PaymentIntent> {
  const intent = await load(intentId);
  if (intent.status !== "paying" || !intent.paypalBatchId) return intent;
  const batch = await getPayoutBatch(intent.paypalBatchId);
  const item = batch.items?.[0];
  const status = item?.transaction_status ?? batch.batch_header.batch_status;

  if (status === "SUCCESS") {
    await markPaid(intent, item?.payout_item_id ?? null, item?.transaction_id ?? null);
  } else if (["FAILED", "RETURNED", "BLOCKED", "DENIED", "REFUNDED"].includes(status)) {
    await fail(intent, item?.errors?.message ?? `PayPal status ${status}`);
  }
  return load(intentId);
}

export async function markPaid(intent: PaymentIntent, itemId: string | null, txId: string | null) {
  const db = await getDb();
  const updated = await db
    .update(paymentIntents)
    .set({ status: "paid", paypalItemId: itemId, paypalTransactionId: txId, updatedAt: new Date() })
    .where(and(eq(paymentIntents.id, intent.id), eq(paymentIntents.status, "paying")))
    .returning({ id: paymentIntents.id });
  if (!updated.length) return; // already settled

  // Own-wallet payments came from the person's PayPal, not the pot.
  if (intent.funding !== "own") {
    await db.insert(ledgerEntries).values({
      circleId: intent.circleId,
      type: "payment",
      amountMinor: -intent.amountMinor,
      intentId: intent.id,
      description: `${intent.payeeName} — ${intent.summary}`,
    });
  }
  await audit(intent.circleId, "paypal", "payout_succeeded", { itemId, txId }, intent.id);
  await alert(
    intent.circleId,
    "info",
    `Paid ${intent.payeeName}`,
    `${formatMoney(intent.amountMinor, intent.currency)} · ${intent.summary}`,
    intent.id,
  );
}

async function fail(intent: PaymentIntent, reason: string) {
  const db = await getDb();
  await db
    .update(paymentIntents)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(eq(paymentIntents.id, intent.id));
  await audit(intent.circleId, "agent", "payment_failed", { reason }, intent.id);
  await alert(intent.circleId, "danger", `Couldn't pay ${intent.payeeName}`, reason, intent.id);
}

export async function transition(id: string, from: IntentStatus, to: IntentStatus): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(paymentIntents)
    .set({ status: to, updatedAt: new Date() })
    .where(and(eq(paymentIntents.id, id), eq(paymentIntents.status, from)))
    .returning({ id: paymentIntents.id });
  return rows.length > 0;
}

export async function load(id: string): Promise<PaymentIntent> {
  const db = await getDb();
  const [row] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, id));
  if (!row) throw new Error(`Payment ${id} not found`);
  return row;
}
