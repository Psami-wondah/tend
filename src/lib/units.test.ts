/**
 * Pure pieces added for the redesign: time zones, rule editing, the offline
 * reader, passbook questions, and the duplicate-pair finder.
 */
import { describe, expect, it } from "vitest";
import { handAngles, isAwake, localTime, whoIsAwake } from "./time";
import { applyProposal, diffMandates, readRule, validateMandate, writeRule } from "./mandate/edit";
import { DEFAULT_MANDATE } from "./mandate/defaults";
import { findAmount, heuristicExtract, parseRuleRequestOffline } from "./agent/offline";
import { parsePassbookQuestion, rowMatches } from "./passbook-filter";
import { findDuplicatePairs } from "./recoveries";
import { evaluate } from "./mandate/engine";

const at = new Date("2026-10-31T08:20:00Z");

describe("time zones", () => {
  it("reads each family member's local time", () => {
    expect(localTime("Europe/London", at).label).toBe("8:20 am");
    expect(localTime("America/Toronto", at).label).toBe("4:20 am");
    expect(localTime("Africa/Lagos", at).label).toBe("9:20 am");
    expect(localTime("America/Chicago", at).hour).toBe(3);
  });

  it("splits the family into awake and asleep", () => {
    const people = [
      { name: "Ada", timezone: "Europe/London" },
      { name: "Tunde", timezone: "America/Toronto" },
      { name: "Chioma", timezone: "Africa/Lagos" },
    ];
    const { awake, asleep } = whoIsAwake(people, at);
    expect(awake.map((p) => p.name)).toEqual(["Ada", "Chioma"]);
    expect(asleep.map((p) => p.name)).toEqual(["Tunde"]);
    expect(isAwake("not/a-zone", new Date("2026-10-31T15:00:00Z"))).toBe(true); // falls back to Chicago, 10am
  });

  it("points clock hands the right way", () => {
    expect(handAngles({ hour: 3, minute: 0, second: 0 })).toEqual({ hour: 90, minute: 0, second: 0 });
    expect(handAngles({ hour: 18, minute: 30, second: 0 }).hour).toBe(195);
  });
});

describe("editing the mandate", () => {
  it("writes and reads flat rule paths without touching the original", () => {
    const next = writeRule(DEFAULT_MANDATE, "categories.pharmacy.autoPayUpToMinor", 8_000);
    expect(readRule(next, "categories.pharmacy.autoPayUpToMinor")).toBe(8_000);
    expect(readRule(DEFAULT_MANDATE, "categories.pharmacy.autoPayUpToMinor")).toBe(6_000);
    const unblocked = writeRule(DEFAULT_MANDATE, "blockedMethods.crypto", false);
    expect(unblocked.blockedMethods).not.toContain("crypto");
    const noBudget = writeRule(DEFAULT_MANDATE, "categories.pharmacy.monthlyBudgetMinor", null);
    expect(noBudget.categories.pharmacy.monthlyBudgetMinor).toBeUndefined();
  });

  it("rejects nonsense values", () => {
    expect(() => writeRule(DEFAULT_MANDATE, "largePaymentApprovals", 0)).toThrow();
    expect(() => writeRule(DEFAULT_MANDATE, "categories.carer.autoPayUpToMinor", -5)).toThrow();
    expect(() => writeRule(DEFAULT_MANDATE, "nope.nope", 1)).toThrow();
  });

  it("describes changes and flags the ones that loosen the rules", () => {
    let next = writeRule(DEFAULT_MANDATE, "categories.pharmacy.autoPayUpToMinor", 8_000);
    next = writeRule(next, "largePaymentApprovals", 1);
    next = writeRule(next, "categories.transport.autoPayUpToMinor", 2_000);
    const changes = diffMandates(DEFAULT_MANDATE, next);
    expect(changes.map((c) => [c.label, c.display, c.loosens])).toEqual([
      ["Pharmacy auto-pay limit", "$60.00 → $80.00", true],
      ["Transport auto-pay limit", "$40.00 → $20.00", false],
      ["Approvals for large payments", "2 people → 1 person", true],
    ]);
  });

  it("never lets gift cards be unblocked", () => {
    const loose = writeRule(DEFAULT_MANDATE, "blockedMethods.gift_card", false);
    expect(validateMandate(loose).join(" ")).toMatch(/Gift cards stay blocked/);
    expect(validateMandate(DEFAULT_MANDATE)).toEqual([]);
  });

  it("applies a model proposal given in dollars", () => {
    const r = applyProposal(DEFAULT_MANDATE, { understood: true, reply: "", changes: [{ path: "categories.pharmacy.autoPayUpToMinor", value: 80 }] });
    expect(r.mandate.categories.pharmacy.autoPayUpToMinor).toBe(8_000);
    expect(r.changes).toHaveLength(1);
    expect(r.problems).toEqual([]);
  });

  it("a looser limit changes what the engine decides", () => {
    const proposal = {
      amountMinor: 7_500,
      currency: "USD",
      category: "pharmacy" as const,
      method: "paypal" as const,
      payee: { id: "p1", name: "Riverside Pharmacy", verified: true, previouslyPaid: true },
      scam: { impersonation: false, urgency: false, secrecy: false, unusualMethod: false, unsolicited: false, riskScore: 0 },
    };
    const state = { potBalanceMinor: 100_000, spentThisMonthMinor: {} };
    expect(evaluate(proposal, DEFAULT_MANDATE, state, "USD").decision).toBe("needs_approval");
    const looser = writeRule(DEFAULT_MANDATE, "categories.pharmacy.autoPayUpToMinor", 8_000);
    expect(evaluate(proposal, looser, state, "USD").decision).toBe("auto_pay");
  });
});

describe("the offline reader (demo mode without AI)", () => {
  it("finds amounts in figures and in words", () => {
    expect(findAmount("Please pay $1,500 today")).toBe(1500);
    expect(findAmount("Total due $24.50")).toBe(24.5);
    expect(findAmount("the taxi was eighteen dollars")).toBe(18);
    expect(findAmount("it cost 42 dollars")).toBe(42);
    expect(findAmount("see you at church")).toBeNull();
  });

  it("refuses-grade signals for the grandchild scam", () => {
    const e = heuristicExtract(
      "Grandma its me, I lost my phone this is my new number. I need $1,500 today. Please don't tell mum. Buy Apple gift cards and send the codes.",
      [],
      "USD",
    );
    expect(e.method).toBe("gift_card");
    expect(e.scam.impersonation && e.scam.urgency && e.scam.secrecy && e.scam.unusualMethod).toBe(true);
    expect(e.scam.riskScore).toBeGreaterThanOrEqual(DEFAULT_MANDATE.scamRefuseThreshold);
  });

  it("reads an ordinary spoken bill for a known payee", () => {
    const e = heuristicExtract("The taxi to my eye appointment was eighteen dollars. It was Bluebird.", [{ name: "Bluebird Cabs", aliases: ["Bluebird"] }], "USD");
    expect(e).toMatchObject({ isPaymentRequest: true, payeeName: "Bluebird Cabs", amount: 18, category: "transport", method: "paypal" });
    expect(e.scam.riskScore).toBeLessThan(DEFAULT_MANDATE.scamReviewThreshold);
  });

  it("doesn't treat a chatty message as a bill", () => {
    const e = heuristicExtract("Hi Mum, church picnic is on Sunday at 2. Bring the jollof!", [], "USD");
    expect(e.isPaymentRequest).toBe(false);
    expect(e.scam.riskScore).toBe(0);
  });

  it("turns simple sentences into rule changes", () => {
    expect(parseRuleRequestOffline("let pharmacy auto-pay up to $80").changes).toEqual([{ path: "categories.pharmacy.autoPayUpToMinor", value: 80 }]);
    expect(parseRuleRequestOffline("large payments need three approvals").changes).toEqual([{ path: "largePaymentApprovals", value: 3 }]);
    expect(parseRuleRequestOffline("block bank transfers").changes).toEqual([{ path: "blockedMethods.bank_transfer", value: true }]);
    expect(parseRuleRequestOffline("make it nicer").understood).toBe(false);
  });
});

describe("asking the passbook", () => {
  const today = new Date("2026-10-31T12:00:00Z");
  const row = (o: Partial<Parameters<typeof rowMatches>[0]>) => ({
    who: "", category: "pharmacy", type: "payment", payee: "Riverside Pharmacy", description: "Riverside Pharmacy — tablets", inMinor: 0, outMinor: 2_450, at: "2026-10-20T10:00:00Z", ...o,
  });

  it("parses people, categories, amounts and dates", () => {
    const q = parsePassbookQuestion("Pharmacy payments over $20 this month", ["Ada", "Tunde"], today);
    expect(q).toMatchObject({ categories: ["pharmacy"], types: ["payment"], minAmount: 20, from: "2026-10-01" });
    expect(parsePassbookQuestion("What has Tunde put in?", ["Ada", "Tunde"], today)).toMatchObject({ people: ["Tunde"], types: ["contribution"] });
  });

  it("filters rows the way the chips say", () => {
    const q = parsePassbookQuestion("Pharmacy payments over $20 this month", [], today);
    expect(rowMatches(row({}), q)).toBe(true);
    expect(rowMatches(row({ outMinor: 1_000 }), q)).toBe(false);
    expect(rowMatches(row({ at: "2026-09-20T10:00:00Z" }), q)).toBe(false);
    expect(rowMatches(row({ category: "transport" }), q)).toBe(false);
  });
});

describe("the duplicate-charge hunter", () => {
  const d = (s: string) => new Date(s);
  it("pairs the same bill paid twice, but not a regular same-price ride weeks apart", () => {
    const pairs = findDuplicatePairs([
      { id: "a", payeeId: "rx", amountMinor: 2_450, reference: "RX-1033", createdAt: d("2026-10-19T15:00:00Z") },
      { id: "b", payeeId: "rx", amountMinor: 2_450, reference: "RX-1033", createdAt: d("2026-10-20T06:00:00Z") },
      { id: "c", payeeId: "rx", amountMinor: 2_450, reference: "RX-1042", createdAt: d("2026-10-28T06:00:00Z") },
      { id: "t1", payeeId: "cab", amountMinor: 1_800, reference: null, createdAt: d("2026-10-04T15:00:00Z") },
      { id: "t2", payeeId: "cab", amountMinor: 1_800, reference: null, createdAt: d("2026-10-25T15:00:00Z") },
    ]);
    expect(pairs.map(([o, dup]) => [o.id, dup.id])).toEqual([["a", "b"]]);
  });
});
