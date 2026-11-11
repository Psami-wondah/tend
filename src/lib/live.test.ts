/**
 * Open pages stay current: a circle's fingerprint moves when anything its
 * pages show changes (and only then), and while PayPal still has a payout in
 * hand, an open page asks PayPal for news, at most every few seconds.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = ":memory:";
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const batch = vi.hoisted(() =>
  vi.fn(async () => ({
    batch_header: { batch_status: "SUCCESS" },
    items: [{ payout_item_id: "ITEM-1", transaction_id: "TX-1", transaction_status: "SUCCESS" }],
  })),
);
vi.mock("./paypal/rest", async (original) => ({ ...(await original<typeof import("./paypal/rest")>()), getPayoutBatch: batch }));

import { and, eq } from "drizzle-orm";
import { seedAll } from "./db/seed-demo";
import { getDb, schema } from "./db/client";
import { audit } from "./circle";
import { catchUp, circleVersion, PAYOUTS_EVERY_MS } from "./live";

let walter: string;
let okafor: string;

beforeAll(async () => {
  const seeded = await seedAll();
  walter = seeded.walter.circle.id;
  okafor = seeded.okafor.circle.id;
});

describe("a circle's fingerprint", () => {
  it("stays put while nothing changes", async () => {
    expect(await circleVersion(walter)).toBe(await circleVersion(walter));
  });

  it("moves when something happens in the circle, and only that circle", async () => {
    const [w, o] = [await circleVersion(walter), await circleVersion(okafor)];
    await audit(walter, "agent", "test_event");
    expect(await circleVersion(walter)).not.toBe(w);
    expect(await circleVersion(okafor)).toBe(o);
  });

  it("moves when a payment changes state", async () => {
    const db = await getDb();
    const [p] = await db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.circleId, okafor)).limit(1);
    const before = await circleVersion(okafor);
    await new Promise((r) => setTimeout(r, 5));
    await db.update(schema.paymentIntents).set({ status: p.status, updatedAt: new Date() }).where(eq(schema.paymentIntents.id, p.id));
    expect(await circleVersion(okafor)).not.toBe(before);
  });
});

describe("an open page while PayPal is sending", () => {
  it("settles a payout PayPal has finished, without waiting for the webhook", async () => {
    const db = await getDb();
    const [paid] = await db
      .select()
      .from(schema.paymentIntents)
      .where(and(eq(schema.paymentIntents.circleId, okafor), eq(schema.paymentIntents.status, "paid"), eq(schema.paymentIntents.funding, "pot")))
      .limit(1);
    await db.update(schema.paymentIntents).set({ status: "paying", paypalBatchId: "REALBATCH-LIVE" }).where(eq(schema.paymentIntents.id, paid.id));

    const t0 = 1_000_000;
    await catchUp(okafor, t0);
    const [after] = await db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, paid.id));
    expect(after.status).toBe("paid");
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it("asks PayPal at most every few seconds, however many pages are open", async () => {
    const db = await getDb();
    const [paid] = await db
      .select()
      .from(schema.paymentIntents)
      .where(and(eq(schema.paymentIntents.circleId, okafor), eq(schema.paymentIntents.status, "paid"), eq(schema.paymentIntents.funding, "pot")))
      .limit(1);
    await db.update(schema.paymentIntents).set({ status: "paying", paypalBatchId: "REALBATCH-LIVE-2" }).where(eq(schema.paymentIntents.id, paid.id));
    batch.mockClear();

    const t1 = 1_000_000 + 1_000; // a second after the last look
    await Promise.all([catchUp(okafor, t1), catchUp(okafor, t1), catchUp(okafor, t1)]);
    expect(batch).not.toHaveBeenCalled();

    await catchUp(okafor, 1_000_000 + PAYOUTS_EVERY_MS);
    expect(batch).toHaveBeenCalledTimes(1);
  });
});
