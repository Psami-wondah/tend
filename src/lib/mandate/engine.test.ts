import { describe, expect, it } from "vitest";
import { evaluate } from "./engine";
import { DEFAULT_MANDATE } from "./defaults";
import type { CircleState, PaymentProposal } from "./types";

const noScam = {
  impersonation: false,
  urgency: false,
  secrecy: false,
  unusualMethod: false,
  unsolicited: false,
  riskScore: 0.02,
};

function proposal(over: Partial<PaymentProposal> = {}): PaymentProposal {
  return {
    amountMinor: 2_450,
    currency: "USD",
    category: "pharmacy",
    method: "paypal",
    payee: { id: "p1", name: "Riverside Pharmacy", verified: true, previouslyPaid: true },
    reference: "RX-1042",
    scam: noScam,
    ...over,
  };
}

const flush: CircleState = { potBalanceMinor: 100_000, spentThisMonthMinor: {} };
const run = (p: PaymentProposal, s: CircleState = flush) =>
  evaluate(p, DEFAULT_MANDATE, s, "USD");

describe("mandate engine", () => {
  it("auto-pays a routine pharmacy refill to a known payee", () => {
    const r = run(proposal());
    expect(r.decision).toBe("auto_pay");
    expect(r.approvalsRequired).toBe(0);
  });

  it("asks one person when over the category auto-pay limit", () => {
    const r = run(proposal({ amountMinor: 9_000 }));
    expect(r.decision).toBe("needs_approval");
    expect(r.approvalsRequired).toBe(1);
    expect(r.reasons.map((x) => x.code)).toContain("over_auto_limit");
  });

  it("asks two people for large payments", () => {
    const r = run(
      proposal({
        amountMinor: 34_000,
        category: "carer",
        payee: { id: "c1", name: "Grace (carer)", verified: true, previouslyPaid: true },
      }),
    );
    expect(r.decision).toBe("needs_approval");
    expect(r.approvalsRequired).toBe(2);
  });

  it("always asks for carer payments, even small ones", () => {
    const r = run(
      proposal({
        amountMinor: 1_000,
        category: "carer",
        payee: { id: "c1", name: "Grace", verified: true, previouslyPaid: true },
      }),
    );
    expect(r.decision).toBe("needs_approval");
  });

  it("needs approval for a first payment to a new payee", () => {
    const r = run(proposal({ payee: { id: "p2", name: "New Chemist", verified: true, previouslyPaid: false } }));
    expect(r.decision).toBe("needs_approval");
    expect(r.reasons.map((x) => x.code)).toContain("new_payee");
  });

  it("needs approval when the payee is unknown to the circle", () => {
    const r = run(proposal({ payee: { id: null, name: "Some Clinic", verified: false, previouslyPaid: false } }));
    expect(r.decision).toBe("needs_approval");
    expect(r.reasons.map((x) => x.code)).toContain("unknown_payee");
  });

  it("refuses gift cards no matter the amount", () => {
    const r = run(proposal({ amountMinor: 500, method: "gift_card" }));
    expect(r.decision).toBe("refuse");
    expect(r.approvalsRequired).toBe(0);
  });

  it("refuses the 'grandson in trouble' scam", () => {
    const r = run(
      proposal({
        amountMinor: 150_000,
        category: "other",
        method: "wire",
        payee: { id: null, name: "Unknown caller", verified: false, previouslyPaid: false },
        scam: {
          impersonation: true,
          urgency: true,
          secrecy: true,
          unusualMethod: true,
          unsolicited: true,
          riskScore: 0.96,
        },
      }),
    );
    expect(r.decision).toBe("refuse");
    expect(r.reasons[0].effect).toBe("refuse");
  });

  it("sends medium-risk requests to the family instead of paying", () => {
    const r = run(proposal({ scam: { ...noScam, unsolicited: true, riskScore: 0.5 } }));
    expect(r.decision).toBe("needs_approval");
    expect(r.reasons.map((x) => x.code)).toContain("scam_review");
  });

  it("flags likely duplicates for a human", () => {
    const r = run(proposal({ duplicateOfIntentId: "intent_123" }));
    expect(r.decision).toBe("needs_approval");
    expect(r.reasons.map((x) => x.code)).toContain("duplicate");
  });

  it("holds when the pot can't cover it", () => {
    const r = run(proposal(), { potBalanceMinor: 1_000, spentThisMonthMinor: {} });
    expect(r.decision).toBe("hold");
  });

  it("needs approval when the monthly category budget would be exceeded", () => {
    const r = run(proposal(), { potBalanceMinor: 100_000, spentThisMonthMinor: { pharmacy: 29_000 } });
    expect(r.decision).toBe("needs_approval");
    expect(r.reasons.map((x) => x.code)).toContain("over_monthly_budget");
  });

  it("refuses invalid amounts and currency mismatches", () => {
    expect(run(proposal({ amountMinor: 0 })).decision).toBe("refuse");
    expect(run(proposal({ currency: "EUR" })).decision).toBe("refuse");
  });

  it("is deterministic", () => {
    const p = proposal({ amountMinor: 9_000 });
    expect(run(p)).toEqual(run(p));
  });
});
