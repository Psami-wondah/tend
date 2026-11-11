import { and, count, eq, lte, max } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { refreshPayout } from "./agent/executor";
import { settleDueHolds } from "./own-payments";
import { syncInvoices } from "./contributions";
import { syncRecoveries } from "./recoveries";

const { paymentIntents, auditEvents, ledgerEntries, alerts, contributions, payees, recoveries, mandates, members } = schema;

/**
 * A fingerprint of everything a circle's pages show. It moves whenever any of
 * it does: a payment changes state, someone votes, money goes in or out, a
 * payee is checked, the rules change, someone joins. Open pages compare it
 * every few seconds and reload their data only when it has moved.
 */
export async function circleVersion(circleId: string): Promise<string> {
  const db = await getDb();
  const parts = await Promise.all([
    db.select({ n: count(), at: max(paymentIntents.updatedAt) }).from(paymentIntents).where(eq(paymentIntents.circleId, circleId)),
    db.select({ n: count(), at: max(auditEvents.createdAt) }).from(auditEvents).where(eq(auditEvents.circleId, circleId)),
    db.select({ n: count(), at: max(ledgerEntries.createdAt) }).from(ledgerEntries).where(eq(ledgerEntries.circleId, circleId)),
    db.select({ n: count(), at: max(alerts.createdAt) }).from(alerts).where(eq(alerts.circleId, circleId)),
    db.select({ n: count(), at: max(contributions.createdAt) }).from(contributions).where(eq(contributions.circleId, circleId)),
    db.select({ n: count(), at: max(payees.createdAt), checked: max(payees.verifiedAt) }).from(payees).where(eq(payees.circleId, circleId)),
    db.select({ n: count(), at: max(recoveries.updatedAt) }).from(recoveries).where(eq(recoveries.circleId, circleId)),
    db.select({ n: count(), at: max(mandates.createdAt) }).from(mandates).where(eq(mandates.circleId, circleId)),
    db.select({ n: count() }).from(members).where(eq(members.circleId, circleId)),
  ]);
  return parts
    .map(([row]) =>
      Object.values(row ?? {})
        .map((v) => (v instanceof Date ? v.getTime() : v == null ? "" : String(v)))
        .join("."),
    )
    .join("|");
}

/** How often open pages may ask PayPal about payouts and ended holds, and about invoices. */
export const PAYOUTS_EVERY_MS = 5_000;
export const INVOICES_EVERY_MS = 30_000;

const asked = new Map<string, { payouts: number; invoices: number }>();
const running = new Map<string, Promise<void>>();

/**
 * While PayPal still has something of this circle's in hand, ask it for news:
 * payouts still sending, holds whose time is up, invoices out for payment.
 * PayPal's webhooks usually get there first; this covers the moments they're
 * slow, or can't reach Tend at all (on a laptop). Throttled per circle, so
 * any number of open pages cost PayPal one look every few seconds.
 */
export function catchUp(circleId: string, now = Date.now()): Promise<void> {
  const already = running.get(circleId);
  if (already) return already;
  const run = askPayPal(circleId, now).finally(() => running.delete(circleId));
  running.set(circleId, run);
  return run;
}

async function askPayPal(circleId: string, now: number) {
  const db = await getDb();
  const last = asked.get(circleId) ?? { payouts: 0, invoices: 0 };
  asked.set(circleId, last);

  if (now - last.payouts >= PAYOUTS_EVERY_MS) {
    last.payouts = now;
    const paying = await db
      .select({ id: paymentIntents.id })
      .from(paymentIntents)
      .where(and(eq(paymentIntents.circleId, circleId), eq(paymentIntents.status, "paying")));
    for (const p of paying) await refreshPayout(p.id).catch(() => undefined);

    const [due] = await db
      .select({ id: paymentIntents.id })
      .from(paymentIntents)
      .where(and(eq(paymentIntents.circleId, circleId), eq(paymentIntents.funding, "own"), eq(paymentIntents.status, "held"), lte(paymentIntents.holdUntil, new Date(now))))
      .limit(1);
    if (due) await settleDueHolds(new Date(now)).catch(() => undefined);
  }

  if (now - last.invoices >= INVOICES_EVERY_MS) {
    last.invoices = now;
    await syncInvoices(circleId).catch(() => undefined);
    await syncRecoveries(circleId).catch(() => undefined);
  }
}
