import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { verifyWebhook } from "@/lib/paypal/rest";
import { markPaid, refreshPayout } from "@/lib/agent/executor";
import { settleInvoice } from "@/lib/contributions";
import { audit, getCircle } from "@/lib/circle";

export const runtime = "nodejs";

type Event = { id: string; event_type: string; resource: Record<string, any> };

/**
 * PayPal webhooks. Subscribe your sandbox app to:
 *   PAYMENT.PAYOUTS-ITEM.SUCCEEDED / .FAILED / .RETURNED / .BLOCKED
 *   INVOICING.INVOICE.PAID
 * Every handler is idempotent, so redeliveries are harmless.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyWebhook(req.headers, raw).catch(() => false))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  const event = JSON.parse(raw) as Event;
  const db = await getDb();
  const circle = await getCircle();
  await audit(circle.id, "paypal", `webhook:${event.event_type}`, { eventId: event.id });

  switch (event.event_type) {
    case "PAYMENT.PAYOUTS-ITEM.SUCCEEDED": {
      const intentId = event.resource.payout_item?.sender_item_id as string | undefined;
      if (intentId) {
        const [intent] = await db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, intentId));
        if (intent) await markPaid(intent, event.resource.payout_item_id ?? null, event.resource.transaction_id ?? null);
      }
      break;
    }
    case "PAYMENT.PAYOUTS-ITEM.FAILED":
    case "PAYMENT.PAYOUTS-ITEM.RETURNED":
    case "PAYMENT.PAYOUTS-ITEM.BLOCKED": {
      const intentId = event.resource.payout_item?.sender_item_id as string | undefined;
      if (intentId) await refreshPayout(intentId);
      break;
    }
    case "INVOICING.INVOICE.PAID": {
      const invoiceId = (event.resource.invoice?.id ?? event.resource.id) as string | undefined;
      if (invoiceId) await settleInvoice(invoiceId);
      break;
    }
  }
  return NextResponse.json({ ok: true });
}
