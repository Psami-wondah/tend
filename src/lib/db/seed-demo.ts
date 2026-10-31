import { getDb, schema } from "./client";
import { DEFAULT_MANDATE } from "../mandate/defaults";
import { evaluate } from "../mandate/engine";
import { appCurrency } from "../money";

const env = (k: string, d: string) => process.env[k]?.trim() || d;

/** Creates the demo circle: Mum, three siblings, three payees, an opening balance. */
export async function seedDemo() {
  const db = await getDb();
  const currency = appCurrency();
  const [circle] = await db
    .insert(schema.circles)
    .values({ name: "Mum's care circle", careRecipientName: "Mum", currency })
    .returning();

  const [ada, tunde, chioma] = await db
    .insert(schema.members)
    .values([
      { circleId: circle.id, name: "Ada", role: "owner", email: env("SANDBOX_ADA_EMAIL", "ada@tend-family.example.com") },
      { circleId: circle.id, name: "Tunde", role: "sibling", email: env("SANDBOX_TUNDE_EMAIL", "tunde@tend-family.example.com") },
      { circleId: circle.id, name: "Chioma", role: "sibling", email: env("SANDBOX_CHIOMA_EMAIL", "chioma@tend-family.example.com") },
      { circleId: circle.id, name: "Mum", role: "care_recipient", email: env("SANDBOX_MUM_EMAIL", "mum@tend-family.example.com") },
    ])
    .returning();

  const [pharmacy] = await db
    .insert(schema.payees)
    .values([
      {
        circleId: circle.id,
        name: "Riverside Pharmacy",
        aliases: ["Riverside Rx", "Riverside Chemist", "Riverside Pharmacy Ltd"],
        kind: "pharmacy",
        paypalEmail: env("SANDBOX_PHARMACY_EMAIL", "pharmacy@tend-payees.example.com"),
        verified: true,
      },
      {
        circleId: circle.id,
        name: "Grace Mensah",
        aliases: ["Grace", "Grace M", "Grace Home Care"],
        kind: "carer",
        paypalEmail: env("SANDBOX_CARER_EMAIL", "grace@tend-payees.example.com"),
        verified: true,
      },
      {
        circleId: circle.id,
        name: "Bluebird Cabs",
        aliases: ["Bluebird Taxis", "Bluebird"],
        kind: "transport",
        paypalEmail: env("SANDBOX_TAXI_EMAIL", "bluebird@tend-payees.example.com"),
        verified: true,
      },
    ])
    .returning();

  await db.insert(schema.mandates).values({ circleId: circle.id, version: 1, rules: DEFAULT_MANDATE, createdBy: ada.id });

  // Opening balance so the demo starts with money in the pot. Real top-ups go
  // through PayPal Checkout or Agent Toolkit invoices.
  const opening = [
    { m: ada, amt: 30_000 },
    { m: tunde, amt: 25_000 },
    { m: chioma, amt: 20_000 },
  ];
  const openedAt = new Date(Date.now() - 40 * 24 * 3600 * 1000);
  for (const { m, amt } of opening) {
    const [c] = await db
      .insert(schema.contributions)
      .values({ circleId: circle.id, memberId: m.id, amountMinor: amt, currency, source: "checkout", status: "completed", createdAt: openedAt })
      .returning();
    await db.insert(schema.ledgerEntries).values({
      circleId: circle.id,
      type: "contribution",
      amountMinor: amt,
      memberId: m.id,
      contributionId: c.id,
      description: `${m.name} — opening balance (seed data)`,
      createdAt: openedAt,
    });
  }

  // One past pharmacy payment, so Riverside is a known payee and a routine
  // refill can auto-pay in the demo.
  const lastMonth = new Date(Date.now() - 32 * 24 * 3600 * 1000);
  const evaluation = evaluate(
    {
      amountMinor: 2_180,
      currency,
      category: "pharmacy",
      method: "paypal",
      payee: { id: pharmacy.id, name: pharmacy.name, verified: true, previouslyPaid: false },
      reference: "RX-0987",
      scam: { impersonation: false, urgency: false, secrecy: false, unusualMethod: false, unsolicited: false, riskScore: 0 },
    },
    DEFAULT_MANDATE,
    { potBalanceMinor: 75_000, spentThisMonthMinor: {} },
    currency,
  );
  const [past] = await db
    .insert(schema.paymentIntents)
    .values({
      circleId: circle.id,
      payeeId: pharmacy.id,
      payeeName: pharmacy.name,
      amountMinor: 2_180,
      currency,
      category: "pharmacy",
      method: "paypal",
      reference: "RX-0987",
      summary: "Last month's blood pressure tablets (seed data).",
      decision: evaluation.decision,
      evaluation,
      approvalsRequired: 1,
      status: "paid",
      createdAt: lastMonth,
      updatedAt: lastMonth,
    })
    .returning();
  await db.insert(schema.approvals).values({ intentId: past.id, memberId: ada.id, verdict: "approve" });
  await db.insert(schema.ledgerEntries).values({
    circleId: circle.id,
    type: "payment",
    amountMinor: -2_180,
    intentId: past.id,
    description: "Riverside Pharmacy — last month's tablets (seed data)",
    createdAt: lastMonth,
  });

  return { circle, members: { ada, tunde, chioma }, pharmacy };
}
