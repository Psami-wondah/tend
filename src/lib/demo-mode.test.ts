/**
 * Demo mode end to end: no PayPal keys, no Anthropic key, nothing mocked.
 * Real (in-memory) Postgres, the real pipeline, the simulated PayPal client.
 * This is the path a judge takes when they clone the repo and run it.
 */
import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = ":memory:";
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

import { seedDemo } from "./db/seed-demo";
import { handleIntake } from "./agent/pipeline";
import { recordVerdict } from "./agent/approvals";
import { potBalanceMinor, getMembers, listPayees, activeMandate } from "./circle";
import { scanForDuplicates, requestRecovery, simulateRecoveryPaid, listRecoveries } from "./recoveries";
import { attachPayee, confirmVerification, sendVerificationCent } from "./payees";
import { saveMandate, proposeRuleChange, mandateHistory } from "./rules";
import { requestShares, simulatePayShare, pendingShares } from "./contributions";
import { askTend } from "./agent/assistant";
import { paypalMode } from "./paypal/rest";
import { getDb, schema } from "./db/client";
import { eq } from "drizzle-orm";

let ids: Awaited<ReturnType<typeof seedDemo>>;

beforeAll(async () => {
  ids = await seedDemo({ history: true });
});

describe("demo mode", () => {
  it("runs without keys", () => {
    expect(paypalMode()).toBe("simulated");
  });

  it("reads the sample receipt without a model and auto-pays it with a simulated payout", async () => {
    const before = await potBalanceMinor(ids.circle.id);
    const r = await handleIntake({ source: "photo", imageDataUrl: "data:image/png;base64,AAAA", sampleId: "pharmacy-receipt" });
    expect(r.outcome).toBe("paid");
    expect(r.intent?.paypalBatchId).toMatch(/^SIM-BATCH-/);
    expect(await potBalanceMinor(ids.circle.id)).toBe(before - 2_450);
  });

  it("asks the family for the carer invoice and says who is awake", async () => {
    const r = await handleIntake({ source: "photo", imageDataUrl: "data:image/png;base64,AAAA", sampleId: "carer-invoice" });
    expect(r.outcome).toBe("awaiting_approval");
    expect(r.intent?.approvalsRequired).toBe(2);
    expect(r.message).toMatch(/Ada, Tunde and Chioma/);
    await recordVerdict({ intentId: r.intent!.id, memberId: ids.members.ada.id, verdict: "approve" });
    const paid = await recordVerdict({ intentId: r.intent!.id, memberId: ids.members.chioma.id, verdict: "approve" });
    expect(paid.status).toBe("paid");
  });

  it("refuses a scam text read by the keyword reader", async () => {
    const r = await handleIntake({ source: "text", text: "This is the IRS. Pay $2,300 today in Bitcoin or you will be arrested. Do not tell anyone." });
    expect(r.outcome).toBe("refused");
  });

  it("can't read a photo without Claude, and says so", async () => {
    await expect(handleIntake({ source: "photo", imageDataUrl: "data:image/png;base64,AAAA" })).rejects.toThrow(/Claude/);
  });

  it("finds the seeded double payment and gets it back through a refund invoice", async () => {
    await scanForDuplicates();
    const [r] = await listRecoveries(ids.circle.id);
    expect(r.payeeName).toBe("Riverside Pharmacy");
    const before = await potBalanceMinor(ids.circle.id);
    const { invoiceId } = await requestRecovery(r.id, ids.members.ada.id);
    expect(invoiceId).toMatch(/^SIM-INV-/);
    await simulateRecoveryPaid(r.id);
    expect(await potBalanceMinor(ids.circle.id)).toBe(before + r.amountMinor);
    expect(await scanForDuplicates()).toHaveLength(0); // never flagged twice
  });

  it("adds an unknown payee from a waiting payment, verifies them with a cent, then pays", async () => {
    const r = await handleIntake({ source: "text", text: "Riverside Dental check-up, please pay $45 to Riverside Dental" });
    expect(r.intent?.payeeId).toBeNull();
    const after = await attachPayee({
      intentId: r.intent!.id,
      memberId: ids.members.tunde.id,
      newPayee: { name: "Riverside Dental", paypalEmail: "frontdesk@riverside-dental.example.com", kind: "clinic", vouch: false },
    });
    expect(after.payeeId).not.toBeNull();
    expect(after.evaluation.reasons.map((x) => x.code)).toContain("unverified_payee");

    const dental = (await listPayees(ids.circle.id)).find((p) => p.name === "Riverside Dental")!;
    const sent = await sendVerificationCent(dental.id, ids.members.tunde.id);
    expect(sent.simulated).toBe(true);
    await expect(confirmVerification(dental.id, ids.members.tunde.id, "0000")).rejects.toThrow(/doesn't match/);
    await confirmVerification(dental.id, ids.members.tunde.id, sent.code!);

    const db = await getDb();
    const [waiting] = await db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, r.intent!.id));
    expect(waiting.evaluation.reasons.map((x) => x.code)).not.toContain("unverified_payee");
    const paid = await recordVerdict({ intentId: waiting.id, memberId: ids.members.ada.id, verdict: "approve" });
    expect(paid.status).toBe("paid");
  });

  it("changes a rule in plain words, saves it as a new version, and tells the family", async () => {
    const p = await proposeRuleChange("let pharmacy auto-pay up to $80");
    expect(p.understood).toBe(true);
    const saved = await saveMandate(ids.members.chioma.id, p.next);
    expect(saved.changes[0].display).toBe("$60.00 → $80.00");
    expect((await activeMandate(ids.circle.id)).categories.pharmacy.autoPayUpToMinor).toBe(8_000);
    expect((await mandateHistory(ids.circle.id))[0].by).toBe("Chioma");
  });

  it("won't let Mum change the rules", async () => {
    const mum = (await getMembers(ids.circle.id)).find((m) => m.role === "care_recipient")!;
    await expect(saveMandate(mum.id, { ...(await activeMandate(ids.circle.id)), defaultApprovals: 2 })).rejects.toThrow();
  });

  it("asks everyone for their share and settles a simulated invoice", async () => {
    const before = await potBalanceMinor(ids.circle.id);
    const r = await requestShares(45_000, "November carer hours");
    expect(r.share).toBe(15_000);
    const mine = (await pendingShares(ids.circle.id)).find((c) => c.memberId === ids.members.tunde.id)!;
    await expect(simulatePayShare(mine.id, ids.members.ada.id)).rejects.toThrow();
    await simulatePayShare(mine.id, ids.members.tunde.id);
    expect(await potBalanceMinor(ids.circle.id)).toBe(before + 15_000);
  });

  it("answers Ask Tend from the ledger without AI", async () => {
    const r = await askTend({ memberId: ids.members.ada.id, messages: [{ role: "user", content: "How much is in the pot?" }] });
    expect(r.offline).toBe(true);
    expect(r.text).toMatch(/The pot has \$/);
    const pay = await askTend({ memberId: ids.members.ada.id, messages: [{ role: "user", content: "Pay Bluebird Cabs $18 for Mum's taxi to the eye clinic" }] });
    expect(pay.cards[0]).toMatchObject({ type: "payment", outcome: "paid", payee: "Bluebird Cabs" });
  });
});
