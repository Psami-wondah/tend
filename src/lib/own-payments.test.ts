/**
 * The second key: Walter pays from his own PayPal, and Tend holds anything
 * unusual long enough for his niece or neighbour to look. Real (in-memory)
 * Postgres, the real decision code, simulated PayPal.
 */
import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = ":memory:";
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

import { eq } from "drizzle-orm";
import { seedAll } from "./db/seed-demo";
import { confirmOwnPayment, settleDueHolds, startOwnPayment, stopOwnPayment } from "./own-payments";
import { recordVerdict } from "./agent/approvals";
import { finishVault, startVault } from "./vault";
import { getDb, schema } from "./db/client";
import { listPayees, potBalanceMinor } from "./circle";
import type { Extraction } from "./agent/schemas";

let w: Awaited<ReturnType<typeof seedAll>>["walter"];
let okaforCircle: string;

const bill = (over: Partial<Extraction> = {}): Extraction => ({
  kind: "bill",
  isPaymentRequest: true,
  payeeName: "Saguaro Pharmacy",
  payeeEmail: null,
  amount: 38.2,
  currency: "USD",
  category: "pharmacy",
  method: "paypal",
  reference: "SR-2301",
  dueDate: null,
  summary: "Walter's heart tablets.",
  scam: { impersonation: false, urgency: false, secrecy: false, unusualMethod: false, unsolicited: false, riskScore: 0.02, explanation: "Ordinary pharmacy bill." },
  confidence: 0.95,
  ...over,
});

beforeAll(async () => {
  const all = await seedAll();
  w = all.walter;
  okaforCircle = all.okafor.circle.id;
});

describe("the cooling-off hold on someone's own PayPal", () => {
  it("lets a routine payment to someone he pays every month go straight through, without touching any pot", async () => {
    const okaforBefore = await potBalanceMinor(okaforCircle);
    const start = await startOwnPayment({ payerId: w.members.walter.id, source: "text", preExtracted: bill() });
    expect(start.outcome).toBe("approve");
    expect(start.plan?.decision).toBe("auto_pay");
    expect(start.orderId).toMatch(/^SIM-ORDER-/);
    const done = await confirmOwnPayment(start.intent!.id, start.orderId!);
    expect(done.outcome).toBe("paid");
    expect(await potBalanceMinor(w.circle.id)).toBe(0);
    expect(await potBalanceMinor(okaforCircle)).toBe(okaforBefore);
  });

  it("holds a first payment to someone new for a day, and his neighbour can stop it", async () => {
    const start = await startOwnPayment({
      payerId: w.members.walter.id,
      source: "text",
      preExtracted: bill({ payeeName: "Ridgeline Roofing", payeeEmail: "jobs@ridgeline-roof.example.com", amount: 650, category: "other", reference: null, summary: "Roof repair deposit." }),
    });
    expect(start.plan?.decision).toBe("cool_off");
    const held = await confirmOwnPayment(start.intent!.id, start.orderId!);
    expect(held.outcome).toBe("held");
    const hours = (held.intent!.holdUntil!.getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(23);
    expect(hours).toBeLessThanOrEqual(24);
    const stopped = await stopOwnPayment(start.intent!.id, w.members.dolores.id, "Not a real roofer");
    expect(stopped.status).toBe("voided");
    expect(stopped.stoppedBy).toBe(w.members.dolores.id);
  });

  it("releases a held payment when the cooling-off ends and nobody objected", async () => {
    const start = await startOwnPayment({
      payerId: w.members.walter.id,
      source: "text",
      preExtracted: bill({ payeeName: "Tucson Lock & Key", payeeEmail: "pay@tucsonlock.example.com", amount: 140, category: "other", reference: "TLK-9", summary: "New front-door lock." }),
    });
    await confirmOwnPayment(start.intent!.id, start.orderId!);
    const settled = await settleDueHolds(new Date(Date.now() + 25 * 3600_000));
    expect(settled.find((s) => s.id === start.intent!.id)?.status).toBe("paid");
  });

  it("waits for one person in the circle when there are warning signs, and their yes releases it", async () => {
    const start = await startOwnPayment({
      payerId: w.members.walter.id,
      source: "text",
      preExtracted: bill({
        payeeName: "Medicare Card Services",
        payeeEmail: "renewals@medicare-card-help.example.com",
        amount: 89,
        category: "other",
        reference: null,
        summary: "A fee to replace a Medicare card.",
        scam: { impersonation: true, urgency: true, secrecy: false, unusualMethod: false, unsolicited: true, riskScore: 0.55, explanation: "Claims to be Medicare and wants a fee." },
      }),
    });
    expect(start.plan?.decision).toBe("needs_approval");
    await confirmOwnPayment(start.intent!.id, start.orderId!);
    const paid = await recordVerdict({ intentId: start.intent!.id, memberId: w.members.priya.id, verdict: "approve" });
    expect(paid.status).toBe("paid");
  });

  it("refuses gift cards before any PayPal order exists", async () => {
    const r = await startOwnPayment({
      payerId: w.members.walter.id,
      source: "text",
      preExtracted: bill({ payeeName: "Unknown number", amount: 500, method: "gift_card", category: "other", reference: null, summary: "Someone asking for gift cards." }),
    });
    expect(r.outcome).toBe("refused");
    expect(r.orderId).toBeUndefined();
  });

  it("spots the PayPal invoice scam: a real invoice with a fake support number", async () => {
    const r = await startOwnPayment({
      payerId: w.members.walter.id,
      source: "text",
      text: "PayPal: You have a new invoice from Geek Squad Total Protection for $499.99. If you did not authorize this renewal, call +1 (808) 555-0199 within 12 hours to cancel.",
    });
    expect(["refused", "warning"]).toContain(r.outcome);
    expect(r.message).toMatch(/real PayPal invoice/);
    expect(r.message).toMatch(/808/);
  });

  it("only Walter can pay from Walter's PayPal", async () => {
    await expect(startOwnPayment({ payerId: w.members.priya.id, source: "text", preExtracted: bill() })).rejects.toThrow(/own PayPal/);
  });

  it("after Walter saves his PayPal once (Vault), refills to a payee he chose are paid without him", async () => {
    const db = await getDb();
    const pharmacy = (await listPayees(w.circle.id)).find((p) => p.name === "Saguaro Pharmacy")!;
    const v = await startVault({ memberId: w.members.walter.id, maxPerPaymentMinor: 6_000, payeeIds: [pharmacy.id], appUrl: "http://localhost" });
    expect(v.simulated).toBe(true);
    const [saved] = await db.select().from(schema.members).where(eq(schema.members.id, w.members.walter.id));
    expect(saved.vaultTokenId).toMatch(/^SIM-VAULT-/);
    const r = await startOwnPayment({ payerId: w.members.walter.id, source: "text", preExtracted: bill({ reference: "SR-2350" }) });
    expect(r.outcome).toBe("paid");
    // Above the amount he agreed to: back to asking him.
    const big = await startOwnPayment({ payerId: w.members.walter.id, source: "text", preExtracted: bill({ amount: 95, reference: "SR-2351" }) });
    expect(big.outcome).toBe("approve");
    await expect(finishVault(w.members.walter.id)).rejects.toThrow();
  });
});

describe("the example roofer", () => {
  it("is paid at a real sandbox address when one is set, not the made-up one in the example", async () => {
    process.env.SANDBOX_ROOFER_EMAIL = "roofer-sandbox@example.com";
    try {
      const start = await startOwnPayment({
        payerId: w.members.walter.id,
        source: "voice",
        preExtracted: bill({
          payeeName: "Ridgeline Roofing",
          payeeEmail: "jobs@ridgeline-roof.example.com",
          amount: 650,
          category: "other",
          reference: null,
          summary: "A $650 roof deposit, asked for at the door.",
          scam: { impersonation: false, urgency: true, secrecy: false, unusualMethod: false, unsolicited: true, riskScore: 0.45, explanation: "A stranger at the door wants money today." },
        }),
      });
      expect(start.intent?.payeeEmail).toBe("roofer-sandbox@example.com");
    } finally {
      delete process.env.SANDBOX_ROOFER_EMAIL;
    }
  });
});
