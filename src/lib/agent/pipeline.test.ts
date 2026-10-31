/**
 * End-to-end: intake → mandate → intent → approvals → payout → ledger,
 * against a real (in-memory) Postgres. The model and PayPal are mocked so the
 * test is fast and free; everything in between is the real code.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = ":memory:";

const payouts: { receiverEmail: string; amountMinor: number; intentId: string }[] = [];

vi.mock("../paypal/rest", async (orig) => ({
  ...(await orig<typeof import("../paypal/rest")>()),
  paypalConfigured: () => true,
  sendPayout: vi.fn(async (o: { receiverEmail: string; amountMinor: number; intentId: string }) => {
    payouts.push(o);
    return { batchId: `BATCH-${o.intentId}`, batchStatus: "PENDING" };
  }),
  getPayoutBatch: vi.fn(async () => ({
    batch_header: { batch_status: "SUCCESS" },
    items: [{ payout_item_id: "ITEM1", transaction_id: "TX1", transaction_status: "SUCCESS" }],
  })),
}));

import { seedDemo } from "../db/seed-demo";
import { handleIntake } from "./pipeline";
import { recordVerdict } from "./approvals";
import { potBalanceMinor } from "../circle";
import type { Extraction } from "./schemas";

let ids: Awaited<ReturnType<typeof seedDemo>>;

const bill = (over: Partial<Extraction> = {}): Extraction => ({
  kind: "prescription",
  isPaymentRequest: true,
  payeeName: "Riverside Rx",
  payeeEmail: null,
  amount: 24.5,
  currency: "USD",
  category: "pharmacy",
  method: "paypal",
  reference: "RX-1042",
  dueDate: null,
  summary: "Your blood pressure tablets.",
  scam: {
    impersonation: false,
    urgency: false,
    secrecy: false,
    unusualMethod: false,
    unsolicited: false,
    riskScore: 0.03,
    explanation: "Normal pharmacy bill.",
  },
  confidence: 0.95,
  ...over,
});

beforeAll(async () => {
  ids = await seedDemo();
});

describe("Tend pipeline", () => {
  it("auto-pays a routine refill and debits the pot", async () => {
    const before = await potBalanceMinor(ids.circle.id);
    const r = await handleIntake({ source: "photo", preExtracted: bill() });
    expect(r.outcome).toBe("paid");
    expect(r.intent?.payeeName).toBe("Riverside Pharmacy"); // matched via alias
    expect(payouts.at(-1)?.amountMinor).toBe(2_450);
    expect(await potBalanceMinor(ids.circle.id)).toBe(before - 2_450);
  });

  it("sends the same bill twice for a human check instead of paying again", async () => {
    const r = await handleIntake({ source: "photo", preExtracted: bill() });
    expect(r.outcome).toBe("awaiting_approval");
    expect(r.evaluation?.reasons.map((x) => x.code)).toContain("duplicate");
  });

  it("needs two approvals for a large carer invoice, then pays", async () => {
    const r = await handleIntake({
      source: "photo",
      preExtracted: bill({
        kind: "invoice",
        payeeName: "Grace Home Care",
        amount: 340,
        category: "carer",
        reference: "INV-77",
        summary: "Grace's hours for the last two weeks.",
      }),
    });
    expect(r.outcome).toBe("awaiting_approval");
    expect(r.intent?.approvalsRequired).toBe(2);
    const id = r.intent!.id;

    const afterOne = await recordVerdict({ intentId: id, memberId: ids.members.ada.id, verdict: "approve" });
    expect(afterOne.status).toBe("awaiting_approval");

    const afterTwo = await recordVerdict({ intentId: id, memberId: ids.members.tunde.id, verdict: "approve" });
    expect(afterTwo.status).toBe("paid");
    expect(payouts.at(-1)?.amountMinor).toBe(34_000);
  }, 15_000);

  it("refuses the grandson scam and pays nothing", async () => {
    const count = payouts.length;
    const r = await handleIntake({
      source: "text",
      preExtracted: bill({
        kind: "payment_request",
        payeeName: "Unknown number",
        amount: 1500,
        category: "other",
        method: "gift_card",
        reference: null,
        summary: "Someone saying they're your grandson and need money.",
        scam: {
          impersonation: true,
          urgency: true,
          secrecy: true,
          unusualMethod: true,
          unsolicited: true,
          riskScore: 0.97,
          explanation: "Classic grandparent scam: urgency, secrecy and gift cards.",
        },
      }),
    });
    expect(r.outcome).toBe("refused");
    expect(r.message).toMatch(/haven't paid/);
    expect(payouts.length).toBe(count);
  });

  it("one rejection stops a payment", async () => {
    const r = await handleIntake({
      source: "text",
      preExtracted: bill({ payeeName: "Bluebird Cabs", amount: 65, category: "transport", reference: "T-9" }),
    });
    expect(r.outcome).toBe("awaiting_approval");
    const after = await recordVerdict({ intentId: r.intent!.id, memberId: ids.members.chioma.id, verdict: "reject" });
    expect(after.status).toBe("rejected");
  });

  it("does not let the care recipient approve her own payments", async () => {
    const r = await handleIntake({
      source: "text",
      preExtracted: bill({ payeeName: "Bluebird Cabs", amount: 70, category: "transport", reference: "T-10" }),
    });
    const { getMembers } = await import("../circle");
    const mum = (await getMembers(ids.circle.id)).find((m) => m.role === "care_recipient")!;
    await expect(recordVerdict({ intentId: r.intent!.id, memberId: mum.id, verdict: "approve" })).rejects.toThrow();
  });
});
