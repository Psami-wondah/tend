import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { alert, audit, getCircle, getMember } from "./circle";
import { runPayPalTool } from "./paypal/toolkit";
import { isSimulatedId } from "./paypal/rest";
import { formatMoney, toMajorString } from "./money";
import { isFamily } from "./people";
import type { PaymentIntent, Recovery } from "./db/schema";

const { recoveries, paymentIntents, payees, ledgerEntries } = schema;

export class RecoveryError extends Error {}

const DAY = 24 * 3600 * 1000;

/**
 * Pure: pairs of paid payments that look like the same bill paid twice.
 * Same payee, same amount, and the same reference within 30 days (or, with
 * no reference to compare, within 3 days). Returns [original, duplicate] pairs.
 */
export function findDuplicatePairs(paid: Pick<PaymentIntent, "id" | "payeeId" | "amountMinor" | "reference" | "createdAt">[]) {
  const sorted = [...paid].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const pairs: [typeof paid[number], typeof paid[number]][] = [];
  const used = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    const later = sorted[i];
    if (!later.payeeId) continue;
    for (let j = i - 1; j >= 0; j--) {
      const earlier = sorted[j];
      if (used.has(earlier.id)) continue;
      if (later.createdAt.getTime() - earlier.createdAt.getTime() > 30 * DAY) break;
      const gap = later.createdAt.getTime() - earlier.createdAt.getTime();
      const sameRef = later.reference && earlier.reference ? later.reference === earlier.reference : gap <= 3 * DAY;
      if (earlier.payeeId === later.payeeId && earlier.amountMinor === later.amountMinor && sameRef) {
        pairs.push([earlier, later]);
        used.add(earlier.id);
        used.add(later.id);
        break;
      }
    }
  }
  return pairs;
}

/** Look through the last 60 days of payouts for anything paid twice. */
export async function scanForDuplicates(): Promise<Recovery[]> {
  const db = await getDb();
  const circle = await getCircle();
  const paid = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circle.id), eq(paymentIntents.status, "paid"), gte(paymentIntents.createdAt, new Date(Date.now() - 60 * DAY))))
    .orderBy(asc(paymentIntents.createdAt));
  const known = new Set((await db.select({ id: recoveries.intentId }).from(recoveries).where(eq(recoveries.circleId, circle.id))).map((r) => r.id));
  const found: Recovery[] = [];
  for (const [original, dup] of findDuplicatePairs(paid)) {
    if (known.has(dup.id)) continue;
    const full = paid.find((p) => p.id === dup.id)!;
    const [r] = await db
      .insert(recoveries)
      .values({
        circleId: circle.id,
        intentId: dup.id,
        originalIntentId: original.id,
        payeeId: full.payeeId,
        payeeName: full.payeeName,
        amountMinor: full.amountMinor,
        currency: full.currency,
        status: "found",
      })
      .returning();
    await audit(circle.id, "agent", "duplicate_found", { recoveryId: r.id, originalIntentId: original.id }, dup.id);
    await alert(
      circle.id,
      "action",
      `${full.payeeName} may have been paid twice`,
      `${formatMoney(full.amountMinor, full.currency)}${full.reference ? ` for ${full.reference}` : ""} went out twice. Ask them for it back?`,
      dup.id,
    );
    found.push(r);
  }
  return found;
}

/**
 * A family member says "ask for it back": Tend sends the payee a PayPal
 * invoice for the overpayment through the Agent Toolkit.
 */
export async function requestRecovery(recoveryId: string, memberId: string) {
  const db = await getDb();
  const circle = await getCircle();
  const member = await getMember(memberId);
  if (!member || member.circleId !== circle.id || !isFamily(member)) throw new RecoveryError("Only people in the circle can ask for refunds.");
  const [r] = await db.select().from(recoveries).where(and(eq(recoveries.id, recoveryId), eq(recoveries.circleId, circle.id)));
  if (!r) throw new RecoveryError("Not found.");
  if (r.status !== "found") throw new RecoveryError(`Already ${r.status}.`);
  const [payee] = r.payeeId ? await db.select().from(payees).where(eq(payees.id, r.payeeId)) : [];
  if (!payee) throw new RecoveryError("The payee is no longer on file.");
  const [dup] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, r.intentId));

  const created = await runPayPalTool<{ id?: string; href?: string }>("create_invoice", {
    currency_code: r.currency,
    note: `Hello ${payee.name}. Our records show ${dup?.reference ? `${dup.reference} ` : "this bill "}was paid twice from ${circle.careRecipientName}'s care pot. Please refund the second payment through this invoice. Thank you. (Sent by Tend on behalf of ${member.name}.)`,
    primary_recipients: [{ billing_info: { business_name: payee.name, email_address: payee.paypalEmail } }],
    items: [
      {
        name: "Refund of duplicate payment",
        description: `${dup?.summary ?? "Duplicate payment"}${dup?.reference ? ` · ${dup.reference}` : ""}`.slice(0, 200),
        quantity: "1",
        unit_amount: { currency_code: r.currency, value: toMajorString(r.amountMinor) },
      },
    ],
  });
  const invoiceId = created.id ?? created.href?.split("/").pop();
  if (!invoiceId) throw new RecoveryError("PayPal didn't return an invoice id.");
  await runPayPalTool("send_invoice", { invoice_id: invoiceId, send_to_recipient: true });
  await db
    .update(recoveries)
    .set({ status: "requested", paypalInvoiceId: invoiceId, requestedBy: member.id, updatedAt: new Date() })
    .where(eq(recoveries.id, r.id));
  await audit(circle.id, `member:${member.id}`, "recovery_requested", { recoveryId: r.id, invoiceId, simulated: isSimulatedId(invoiceId) }, r.intentId);
  await alert(circle.id, "info", `Asked ${payee.name} for ${formatMoney(r.amountMinor, r.currency)} back`, `${member.name} sent a PayPal refund invoice for the double payment.`, r.intentId);
  return { invoiceId, simulated: isSimulatedId(invoiceId) };
}

export async function dismissRecovery(recoveryId: string, memberId: string) {
  const db = await getDb();
  const member = await getMember(memberId);
  if (!member || !isFamily(member)) throw new RecoveryError("Only people in the circle can dismiss this.");
  const [r] = await db
    .update(recoveries)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(and(eq(recoveries.id, recoveryId), eq(recoveries.status, "found")))
    .returning();
  if (r) await audit(r.circleId, `member:${member.id}`, "recovery_dismissed", { recoveryId: r.id }, r.intentId);
  return r ?? null;
}

/** Money back in the pot. Idempotent: webhooks, polling and the demo button can all call it. */
export async function settleRecoveryInvoice(invoiceId: string) {
  const db = await getDb();
  const [r] = await db
    .update(recoveries)
    .set({ status: "recovered", updatedAt: new Date() })
    .where(and(eq(recoveries.paypalInvoiceId, invoiceId), eq(recoveries.status, "requested")))
    .returning();
  if (!r) return null;
  await db.insert(ledgerEntries).values({
    circleId: r.circleId,
    type: "refund",
    amountMinor: r.amountMinor,
    intentId: r.intentId,
    description: `${r.payeeName} refunded a double payment`,
  });
  await audit(r.circleId, "paypal", "recovery_paid", { recoveryId: r.id, invoiceId }, r.intentId);
  await alert(r.circleId, "info", `${r.payeeName} paid back ${formatMoney(r.amountMinor, r.currency)}`, "The double payment is back in the pot.", r.intentId);
  return r;
}

/** Demo mode only: stand in for the payee paying the refund invoice. */
export async function simulateRecoveryPaid(recoveryId: string) {
  const db = await getDb();
  const [r] = await db.select().from(recoveries).where(eq(recoveries.id, recoveryId));
  if (!r?.paypalInvoiceId || !isSimulatedId(r.paypalInvoiceId)) throw new RecoveryError("Only simulated invoices can be marked paid here.");
  return settleRecoveryInvoice(r.paypalInvoiceId);
}

/** Polling fallback for real sandbox invoices: every circle's, or one circle's. */
export async function syncRecoveries(circleId?: string) {
  const db = await getDb();
  const open = await db
    .select()
    .from(recoveries)
    .where(and(eq(recoveries.status, "requested"), circleId ? eq(recoveries.circleId, circleId) : undefined));
  for (const r of open) {
    if (!r.paypalInvoiceId || isSimulatedId(r.paypalInvoiceId)) continue;
    try {
      const inv = await runPayPalTool<{ status?: string }>("get_invoice", { invoice_id: r.paypalInvoiceId });
      if (inv.status === "PAID" || inv.status === "MARKED_AS_PAID") await settleRecoveryInvoice(r.paypalInvoiceId);
    } catch {
      /* try again next sync */
    }
  }
}

export async function listRecoveries(circleId: string, statuses: Recovery["status"][] = ["found", "requested"]) {
  const db = await getDb();
  return db
    .select()
    .from(recoveries)
    .where(and(eq(recoveries.circleId, circleId), inArray(recoveries.status, statuses)))
    .orderBy(desc(recoveries.createdAt));
}
