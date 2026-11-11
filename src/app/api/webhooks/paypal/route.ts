import { NextResponse } from "next/server";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { verifyWebhook } from "@/lib/paypal/rest";
import { markPaid, refreshPayout, transition } from "@/lib/agent/executor";
import { settleInvoice } from "@/lib/contributions";
import { audit } from "@/lib/circle";
import type { PaymentIntent } from "@/lib/db/schema";

export const runtime = "nodejs";

type Event = { id: string; event_type: string; resource?: Record<string, any> };
type Subject = { circleId: string; intent: PaymentIntent | null };

const { paymentIntents, contributions, recoveries, auditEvents } = schema;

/**
 * PayPal webhooks. Subscribe your sandbox app to:
 *   PAYMENT.PAYOUTS-ITEM.SUCCEEDED / .UNCLAIMED / .FAILED / .RETURNED / .BLOCKED
 *   INVOICING.INVOICE.PAID
 *   PAYMENT.AUTHORIZATION.VOIDED, PAYMENT.CAPTURE.COMPLETED (cooling-off holds)
 *
 * Each event is recorded once, on the payment it's about and in that
 * payment's own circle, so it shows in the payment's history ("PayPal let
 * Tend know the hold is voided"). An event about nothing Tend knows is
 * answered and dropped. Every handler is idempotent, so redeliveries (and
 * PayPal's Resend button) are harmless.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyWebhook(req.headers, raw).catch(() => false))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const event = JSON.parse(raw) as Event;
  const r = event.resource ?? {};
  const about = await subjectOf(event);
  if (about) await record(about, event);
  const intent = about?.intent ?? null;

  switch (event.event_type) {
    case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED":
      if (intent) await markPaid(intent, r.payout_item_id ?? null, r.transaction_id ?? null);
      break;
    case "PAYMENT.PAYOUTS-ITEM.UNCLAIMED":
    case "PAYMENT.PAYOUTS-ITEM.FAILED":
    case "PAYMENT.PAYOUTS-ITEM.RETURNED":
    case "PAYMENT.PAYOUTS-ITEM.BLOCKED":
      if (intent) await refreshPayout(intent.id);
      break;
    case "PAYMENT.AUTHORIZATION.VOIDED":
      // Voided outside Tend (it expired, say): a held payment can no longer go.
      // When the circle stopped it, Tend has already marked it, and this is PayPal confirming.
      if (intent) await transition(intent.id, "held", "voided");
      break;
    case "INVOICING.INVOICE.PAID": {
      const invoiceId = invoiceOf(r);
      if (invoiceId) await settleInvoice(invoiceId);
      break;
    }
  }
  return NextResponse.json({ ok: true });
}

/** The payment (or share invoice) an event is about. */
async function subjectOf(event: Event): Promise<Subject | null> {
  const db = await getDb();
  const r = event.resource ?? {};
  const payment = async (where: SQL | undefined): Promise<Subject | null> => {
    const [intent] = await db.select().from(paymentIntents).where(where).limit(1);
    return intent ? { circleId: intent.circleId, intent } : null;
  };
  const type = event.event_type;

  if (type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
    const id = r.payout_item?.sender_item_id;
    return typeof id === "string" ? payment(eq(paymentIntents.id, id)) : null;
  }
  if (type.startsWith("PAYMENT.PAYOUTSBATCH.")) {
    const batchId = r.batch_header?.payout_batch_id;
    return typeof batchId === "string" ? payment(eq(paymentIntents.paypalBatchId, batchId)) : null;
  }
  if (type.startsWith("PAYMENT.AUTHORIZATION.")) {
    return typeof r.id === "string" ? payment(eq(paymentIntents.paypalAuthorizationId, r.id)) : null;
  }
  if (type.startsWith("PAYMENT.CAPTURE.")) {
    // The capture id is saved just after capturing, so a fast webhook may
    // only find the payment by the hold it came from.
    const auth = r.supplementary_data?.related_ids?.authorization_id;
    return (
      (typeof r.id === "string" ? await payment(eq(paymentIntents.paypalCaptureId, r.id)) : null) ??
      (typeof auth === "string" ? payment(eq(paymentIntents.paypalAuthorizationId, auth)) : null)
    );
  }
  if (type.startsWith("INVOICING.INVOICE.")) {
    const invoiceId = invoiceOf(r);
    if (!invoiceId) return null;
    const [share] = await db.select().from(contributions).where(eq(contributions.paypalInvoiceId, invoiceId)).limit(1);
    if (share) return { circleId: share.circleId, intent: null };
    const [recovery] = await db.select().from(recoveries).where(eq(recoveries.paypalInvoiceId, invoiceId)).limit(1);
    return recovery ? payment(eq(paymentIntents.id, recovery.intentId)) : null;
  }
  return null;
}

/** Once per PayPal event id, however often PayPal delivers it. */
async function record(about: Subject, event: Event) {
  const db = await getDb();
  const type = `webhook:${event.event_type}`;
  const [seen] = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(and(eq(auditEvents.circleId, about.circleId), eq(auditEvents.type, type), sql`${auditEvents.data}->>'eventId' = ${event.id}`))
    .limit(1);
  if (!seen) await audit(about.circleId, "paypal", type, { eventId: event.id }, about.intent?.id ?? null);
}

function invoiceOf(r: Record<string, any>): string | null {
  const id = r.invoice?.id ?? r.id;
  return typeof id === "string" ? id : null;
}
