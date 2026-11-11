import { and, eq } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { alert, audit, getCircle, getMember, getMembers } from "./circle";
import { captureOrder, createTopUpOrder, isSimulatedId } from "./paypal/rest";
import { runPayPalTool } from "./paypal/toolkit";
import { formatMoney, toMajorString } from "./money";
import { releaseHolds } from "./agent/approvals";
import { settleRecoveryInvoice } from "./recoveries";
import { isFamily } from "./people";

const { contributions, ledgerEntries } = schema;

// --- PayPal Checkout top-ups ------------------------------------------------------

export async function startTopUp(memberId: string, amountMinor: number) {
  const db = await getDb();
  const circle = await getCircle();
  const member = await getMember(memberId);
  if (!member || member.circleId !== circle.id) throw new Error("Unknown member");
  if (amountMinor < 100 || amountMinor > 500_000) throw new Error("Amount out of range");

  const [c] = await db
    .insert(contributions)
    .values({ circleId: circle.id, memberId, amountMinor, currency: circle.currency, source: "checkout", status: "pending" })
    .returning();
  const order = await createTopUpOrder({
    amountMinor,
    currency: circle.currency,
    contributionId: c.id,
    description: `${member.name} → ${circle.careRecipientName}'s care pot`,
  });
  await db.update(contributions).set({ paypalOrderId: order.id }).where(eq(contributions.id, c.id));
  return { orderId: order.id, contributionId: c.id };
}

export async function completeTopUp(orderId: string) {
  const db = await getDb();
  const [c] = await db.select().from(contributions).where(eq(contributions.paypalOrderId, orderId));
  if (!c) throw new Error("Unknown order");
  if (c.status === "completed") return c;

  const capture = await captureOrder(orderId);
  const ok = capture.status === "COMPLETED";
  if (!ok) {
    await db.update(contributions).set({ status: "failed" }).where(eq(contributions.id, c.id));
    throw new Error(`Capture status ${capture.status}`);
  }
  await settleContribution(c.id, { orderId });
  return c;
}

// --- Agent Toolkit invoices: "everyone pay your share" -------------------------

/**
 * Split an amount across the siblings and send each a PayPal invoice, using
 * the Agent Toolkit's create_invoice + send_invoice tools.
 */
export async function requestShares(totalMinor: number, note: string) {
  const db = await getDb();
  const circle = await getCircle();
  const siblings = (await getMembers(circle.id)).filter(isFamily);
  if (!siblings.length) throw new Error("No family members to invoice");
  const share = Math.ceil(totalMinor / siblings.length);

  const results: { member: string; invoiceId?: string; error?: string }[] = [];
  for (const m of siblings) {
    try {
      const created = await runPayPalTool<{ href?: string; id?: string }>("create_invoice", {
        currency_code: circle.currency,
        note: `${note}\n\nYour share of ${circle.careRecipientName}'s care, collected by Tend.`,
        primary_recipients: [
          { billing_info: { name: { given_name: m.name }, email_address: m.email } },
        ],
        items: [
          {
            name: `${circle.careRecipientName}'s care pot`,
            description: note.slice(0, 200),
            quantity: "1",
            unit_amount: { currency_code: circle.currency, value: toMajorString(share) },
          },
        ],
      });
      const invoiceId = created.id ?? created.href?.split("/").pop();
      if (!invoiceId) throw new Error(`Unexpected create_invoice response: ${JSON.stringify(created).slice(0, 200)}`);
      await runPayPalTool("send_invoice", { invoice_id: invoiceId, send_to_recipient: true });

      await db.insert(contributions).values({
        circleId: circle.id,
        memberId: m.id,
        amountMinor: share,
        currency: circle.currency,
        source: "invoice",
        paypalInvoiceId: invoiceId,
        status: "pending",
      });
      results.push({ member: m.name, invoiceId });
    } catch (err) {
      results.push({ member: m.name, error: String(err).slice(0, 300) });
    }
  }
  await audit(circle.id, "agent", "shares_requested", { totalMinor, share, results });
  await alert(circle.id, "info", "Shares requested", `Sent ${siblings.length} PayPal invoices of ${formatMoney(share, circle.currency)}.`);
  return { share, results };
}

/** Poll pending invoices (webhooks don't reach localhost): every circle's, or one circle's. */
export async function syncInvoices(circleId?: string) {
  const db = await getDb();
  const pending = await db
    .select()
    .from(contributions)
    .where(and(eq(contributions.source, "invoice"), eq(contributions.status, "pending"), circleId ? eq(contributions.circleId, circleId) : undefined));
  for (const c of pending) {
    if (!c.paypalInvoiceId || isSimulatedId(c.paypalInvoiceId)) continue;
    try {
      const inv = await runPayPalTool<{ status?: string }>("get_invoice", { invoice_id: c.paypalInvoiceId });
      if (inv.status === "PAID" || inv.status === "MARKED_AS_PAID") {
        await settleContribution(c.id, { invoiceId: c.paypalInvoiceId });
      }
    } catch {
      /* keep pending; try again next sync */
    }
  }
}

/** An invoice was paid: either a sibling's share, or a payee refunding a double payment. */
export async function settleInvoice(invoiceId: string) {
  const db = await getDb();
  const [c] = await db.select().from(contributions).where(eq(contributions.paypalInvoiceId, invoiceId));
  if (c) await settleContribution(c.id, { invoiceId });
  else await settleRecoveryInvoice(invoiceId);
}

/** Demo mode only: stand in for a sibling paying their share invoice in PayPal. */
export async function simulatePayShare(contributionId: string, memberId: string) {
  const db = await getDb();
  const [c] = await db.select().from(contributions).where(eq(contributions.id, contributionId));
  if (!c) throw new Error("Not found");
  if (c.memberId !== memberId) throw new Error("Only the person invoiced can pay their share.");
  if (!isSimulatedId(c.paypalInvoiceId)) throw new Error("This is a real PayPal invoice. Pay it in PayPal.");
  await settleContribution(c.id, { invoiceId: c.paypalInvoiceId!, simulated: "true" });
}

/** Share invoices still open, for the "pay your share" prompts. */
export async function pendingShares(circleId: string) {
  const db = await getDb();
  return db
    .select()
    .from(contributions)
    .where(and(eq(contributions.circleId, circleId), eq(contributions.source, "invoice"), eq(contributions.status, "pending")));
}

async function settleContribution(contributionId: string, ref: Record<string, string>) {
  const db = await getDb();
  const done = await db
    .update(contributions)
    .set({ status: "completed" })
    .where(and(eq(contributions.id, contributionId), eq(contributions.status, "pending")))
    .returning();
  const c = done[0];
  if (!c) return; // already settled
  const member = await getMember(c.memberId);
  await db.insert(ledgerEntries).values({
    circleId: c.circleId,
    type: "contribution",
    amountMinor: c.amountMinor,
    memberId: c.memberId,
    contributionId: c.id,
    description: c.source === "invoice" ? `${member?.name ?? "Family"} paid their share` : `${member?.name ?? "Family"} topped up the pot`,
  });
  await audit(c.circleId, "paypal", "contribution_received", { ...ref, amountMinor: c.amountMinor });
  await alert(c.circleId, "info", `${member?.name ?? "Someone"} added ${formatMoney(c.amountMinor, c.currency)}`, "Thank you.");
  await releaseHolds(c.circleId);
}
