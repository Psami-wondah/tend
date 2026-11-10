/**
 * A payout to an address with no PayPal account comes back UNCLAIMED: PayPal
 * has sent it and holds it until they sign up. Tend must settle it, not show
 * "sending" for 30 days.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = ":memory:";
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

vi.mock("../paypal/rest", async (original) => ({
  ...(await original<typeof import("../paypal/rest")>()),
  getPayoutBatch: vi.fn(async () => ({
    batch_header: { batch_status: "SUCCESS" },
    items: [{ payout_item_id: "ITEM-1", transaction_id: "TX-1", transaction_status: "UNCLAIMED", errors: { message: "The recipient for this payout does not have an account." } }],
  })),
}));

import { and, eq } from "drizzle-orm";
import { seedAll } from "../db/seed-demo";
import { getDb, schema } from "../db/client";
import { refreshPayout } from "./executor";

let intentId: string;

beforeAll(async () => {
  const { walter } = await seedAll();
  const db = await getDb();
  const [paid] = await db
    .select()
    .from(schema.paymentIntents)
    .where(and(eq(schema.paymentIntents.circleId, walter.circle.id), eq(schema.paymentIntents.status, "paid")))
    .limit(1);
  intentId = paid.id;
  // As if Tend had just captured the hold and sent the payout for real.
  await db.update(schema.paymentIntents).set({ status: "paying", paypalBatchId: "REALBATCH1" }).where(eq(schema.paymentIntents.id, intentId));
});

describe("a payout nobody has claimed yet", () => {
  it("counts as paid and says PayPal is holding it for them", async () => {
    const after = await refreshPayout(intentId);
    expect(after.status).toBe("paid");
    const db = await getDb();
    const trail = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.intentId, intentId));
    expect(trail.some((t) => t.type === "payout_unclaimed")).toBe(true);
    const [alert] = await db.select().from(schema.alerts).where(and(eq(schema.alerts.intentId, intentId), eq(schema.alerts.severity, "info")));
    expect(alert.body).toMatch(/holding it until they claim it/);
  });
});
