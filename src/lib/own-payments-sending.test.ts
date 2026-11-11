/**
 * A routine bill is captured from the person's own PayPal at once, then sent on
 * to the payee by Payout, which can take PayPal up to a minute. While that
 * payout is still on its way, the person must hear "Paid", not "Held for now":
 * the money has already left their account.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = ":memory:";
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

vi.mock("./paypal/rest", async (original) => ({
  ...(await original<typeof import("./paypal/rest")>()),
  // PayPal hasn't finished delivering the payout yet.
  getPayoutBatch: vi.fn(async () => ({ batch_header: { batch_status: "PENDING" }, items: [{ transaction_status: "PENDING" }] })),
}));

import { seedAll } from "./db/seed-demo";
import { confirmOwnPayment, startOwnPayment } from "./own-payments";
import type { Extraction } from "./agent/schemas";

let walterId: string;

const refill: Extraction = {
  kind: "bill",
  isPaymentRequest: true,
  payeeName: "Saguaro Pharmacy",
  payeeEmail: null,
  amount: 38.2,
  currency: "USD",
  category: "pharmacy",
  method: "paypal",
  reference: "SR-2361",
  dueDate: null,
  summary: "Walter's heart tablets.",
  scam: { impersonation: false, urgency: false, secrecy: false, unusualMethod: false, unsolicited: false, riskScore: 0.02, explanation: "Ordinary pharmacy bill." },
  confidence: 0.95,
};

beforeAll(async () => {
  const { walter } = await seedAll();
  walterId = walter.members.walter.id;
});

describe("a routine bill while PayPal is still delivering it", () => {
  it("tells the person it's paid, because it has left their PayPal", async () => {
    const start = await startOwnPayment({ payerId: walterId, source: "text", preExtracted: refill });
    expect(start.plan?.decision).toBe("auto_pay");
    const done = await confirmOwnPayment(start.intent!.id, start.orderId!);
    expect(done.intent?.status).toBe("paying");
    expect(done.outcome).toBe("paid");
    expect(done.message).toMatch(/on its way to Saguaro Pharmacy/);
  });
});
