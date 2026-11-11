/**
 * PayPal's webhooks land on the payment they're about, in that payment's own
 * circle, once per event however often PayPal delivers it.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = ":memory:";
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const verify = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/paypal/rest", async (original) => ({
  ...(await original<typeof import("@/lib/paypal/rest")>()),
  verifyWebhook: verify,
}));

import { and, eq } from "drizzle-orm";
import { seedAll } from "@/lib/db/seed-demo";
import { getDb, schema } from "@/lib/db/client";
import { POST } from "./route";

const { paymentIntents, auditEvents } = schema;
let walterCircle: string;
let intentId: string;

const send = (event: object) => POST(new Request("http://localhost/api/webhooks/paypal", { method: "POST", body: JSON.stringify(event) }));
const voided = (eventId: string, authId: string) => ({ id: eventId, event_type: "PAYMENT.AUTHORIZATION.VOIDED", resource: { id: authId, status: "VOIDED" } });

async function recorded(eventId: string) {
  const db = await getDb();
  const rows = await db.select().from(auditEvents).where(eq(auditEvents.type, "webhook:PAYMENT.AUTHORIZATION.VOIDED"));
  return rows.filter((r) => (r.data as { eventId?: string }).eventId === eventId);
}

beforeAll(async () => {
  const { walter } = await seedAll();
  walterCircle = walter.circle.id;
  const db = await getDb();
  const [any] = await db.select().from(paymentIntents).where(eq(paymentIntents.circleId, walterCircle)).limit(1);
  intentId = any.id;
  // As if Tend had asked PayPal to hold it.
  await db.update(paymentIntents).set({ status: "held", paypalAuthorizationId: "AUTH-HELD-1" }).where(eq(paymentIntents.id, intentId));
});

describe("PayPal's webhooks", () => {
  it("are recorded on the payment they're about, in its own circle", async () => {
    const res = await send(voided("WH-1", "AUTH-HELD-1"));
    expect(res.status).toBe(200);
    const rows = await recorded("WH-1");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ circleId: walterCircle, intentId, actor: "paypal" });
  });

  it("stop a hold PayPal voided on its own", async () => {
    const db = await getDb();
    const [after] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, intentId));
    expect(after.status).toBe("voided");
  });

  it("are recorded once however often PayPal sends them", async () => {
    expect((await send(voided("WH-1", "AUTH-HELD-1"))).status).toBe(200);
    expect(await recorded("WH-1")).toHaveLength(1);
  });

  it("about nothing Tend knows are answered and dropped", async () => {
    expect((await send(voided("WH-2", "AUTH-NOBODY"))).status).toBe(200);
    expect(await recorded("WH-2")).toHaveLength(0);
  });

  it("refuse a bad signature without recording anything", async () => {
    verify.mockResolvedValueOnce(false);
    expect((await send(voided("WH-3", "AUTH-HELD-1"))).status).toBe(401);
    const db = await getDb();
    const rows = await db.select().from(auditEvents).where(and(eq(auditEvents.intentId, intentId), eq(auditEvents.actor, "paypal")));
    expect(rows.filter((r) => (r.data as { eventId?: string }).eventId === "WH-3")).toHaveLength(0);
  });
});
