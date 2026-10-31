import { getDb, schema } from "./client";
import { DEFAULT_MANDATE } from "../mandate/defaults";
import { evaluate, evaluateOwnPayment } from "../mandate/engine";
import type { Category, Mandate, ScamSignals } from "../mandate/types";
import { appCurrency } from "../money";
import type { Member, Payee } from "./schema";

const env = (k: string, d: string) => process.env[k]?.trim() || d;
const DAY = 24 * 3600 * 1000;
const daysAgo = (d: number, hour = 12) => {
  const t = new Date(Date.now() - d * DAY);
  t.setUTCHours(hour, 7 + ((d * 13) % 50), 0, 0);
  return t;
};
const CLEAN: ScamSignals = { impersonation: false, urgency: false, secrecy: false, unusualMethod: false, unsolicited: false, riskScore: 0.02 };

/**
 * Creates the demo circle: the Okafor family. Mum lives in Houston; her
 * children are in London, Toronto and Lagos. All people, payees and history
 * here are synthetic seed data.
 *
 * `history: true` adds five weeks of believable activity (uneven top-ups,
 * routine payments, a carer invoice two siblings approved, a refused scam, a
 * pharmacy bill paid twice by mistake, a rules change) so the app opens on a
 * lived-in month. Tests seed without it.
 */
export async function seedDemo(opts: { history?: boolean } = {}) {
  const db = await getDb();
  const currency = appCurrency();
  const [circle] = await db
    .insert(schema.circles)
    .values({
      name: "The Okafor family",
      careRecipientName: "Mum",
      currency,
      story: "Mum lives in Houston. Her three children live in London, Toronto and Lagos, and share her care pot.",
    })
    .returning();

  const [ada, tunde, chioma, mum] = await db
    .insert(schema.members)
    .values([
      { circleId: circle.id, name: "Ada", role: "owner", relation: "daughter", email: env("SANDBOX_ADA_EMAIL", "ada@tend-family.example.com"), city: "London", timezone: "Europe/London", color: "cobalt", homeCurrency: "GBP" },
      { circleId: circle.id, name: "Tunde", role: "sibling", relation: "son", email: env("SANDBOX_TUNDE_EMAIL", "tunde@tend-family.example.com"), city: "Toronto", timezone: "America/Toronto", color: "violet", homeCurrency: "CAD" },
      { circleId: circle.id, name: "Chioma", role: "sibling", relation: "daughter", email: env("SANDBOX_CHIOMA_EMAIL", "chioma@tend-family.example.com"), city: "Lagos", timezone: "Africa/Lagos", color: "magenta", homeCurrency: "NGN" },
      { circleId: circle.id, name: "Mum", role: "care_recipient", email: env("SANDBOX_MUM_EMAIL", "mum@tend-family.example.com"), city: "Houston", timezone: "America/Chicago", color: "brass", homeCurrency: currency },
    ])
    .returning();

  const [pharmacy, carer, taxi] = await db
    .insert(schema.payees)
    .values([
      {
        circleId: circle.id,
        name: "Riverside Pharmacy",
        aliases: ["Riverside Rx", "Riverside Chemist", "Riverside Pharmacy Ltd"],
        kind: "pharmacy",
        paypalEmail: env("SANDBOX_PHARMACY_EMAIL", "pharmacy@tend-payees.example.com"),
        verified: true,
        verifiedBy: ada.id,
        verifiedAt: daysAgo(45),
        addedBy: ada.id,
      },
      {
        circleId: circle.id,
        name: "Grace Mensah",
        aliases: ["Grace", "Grace M", "Grace Home Care"],
        kind: "carer",
        paypalEmail: env("SANDBOX_CARER_EMAIL", "grace@tend-payees.example.com"),
        verified: true,
        verifiedBy: chioma.id,
        verifiedAt: daysAgo(44),
        addedBy: chioma.id,
      },
      {
        circleId: circle.id,
        name: "Bluebird Cabs",
        aliases: ["Bluebird Taxis", "Bluebird"],
        kind: "transport",
        paypalEmail: env("SANDBOX_TAXI_EMAIL", "bluebird@tend-payees.example.com"),
        verified: true,
        verifiedBy: tunde.id,
        verifiedAt: daysAgo(43),
        addedBy: tunde.id,
      },
    ])
    .returning();

  const v1: Mandate = opts.history
    ? { ...DEFAULT_MANDATE, categories: { ...DEFAULT_MANDATE.categories, transport: { autoPayUpToMinor: 3_000, monthlyBudgetMinor: 20_000 } } }
    : DEFAULT_MANDATE;
  await db.insert(schema.mandates).values({ circleId: circle.id, version: 1, rules: v1, createdBy: ada.id, createdAt: daysAgo(45) });

  const members = { ada, tunde, chioma, mum };
  const base = { circle, members, pharmacy };

  if (!opts.history) {
    // Opening balance so the demo starts with money in the pot. Real top-ups
    // go through PayPal Checkout or Agent Toolkit invoices.
    for (const [m, amt] of [[ada, 30_000], [tunde, 25_000], [chioma, 20_000]] as const) {
      await contribute(circle.id, currency, m, amt, "checkout", daysAgo(40));
    }
    await paid({ circleId: circle.id, currency, payee: pharmacy, amountMinor: 2_180, category: "pharmacy", reference: "RX-0987", summary: "Last month's blood pressure tablets.", at: daysAgo(32), mandate: v1, approvers: [ada] });
    return base;
  }

  // --- Five weeks in the life of the care pot ------------------------------
  await contribute(circle.id, currency, ada, 30_000, "checkout", daysAgo(38, 9));
  await contribute(circle.id, currency, tunde, 25_000, "checkout", daysAgo(37, 23));
  await contribute(circle.id, currency, chioma, 15_000, "checkout", daysAgo(35, 7));
  await paid({ circleId: circle.id, currency, payee: pharmacy, amountMinor: 2_180, category: "pharmacy", reference: "RX-0987", summary: "Mum's blood pressure tablets.", at: daysAgo(32, 16), mandate: v1, approvers: [ada] });
  await paid({ circleId: circle.id, currency, payee: taxi, amountMinor: 1_650, category: "transport", reference: "T-4410", summary: "Mum's taxi to the eye clinic.", at: daysAgo(27, 15), mandate: v1 });
  await paid({
    circleId: circle.id, currency, payee: carer, amountMinor: 30_600, category: "carer", reference: "INV-71",
    summary: "Grace's home care visits, 18 hours.", at: daysAgo(21, 14), mandate: v1, approvers: [ada, chioma],
  });

  // "Everyone chip in": invoices Ada and Chioma paid.
  await contribute(circle.id, currency, ada, 10_000, "invoice", daysAgo(18, 10));
  await contribute(circle.id, currency, chioma, 10_000, "invoice", daysAgo(16, 19));

  // Chioma raised the taxi auto-pay limit after a $35 ride needed approval.
  await db.insert(schema.mandates).values({ circleId: circle.id, version: 2, rules: { ...DEFAULT_MANDATE, version: 2 }, createdBy: chioma.id, createdAt: daysAgo(15, 20) });
  await db.insert(schema.auditEvents).values({
    circleId: circle.id, actor: `member:${chioma.id}`, type: "mandate_changed", createdAt: daysAgo(15, 20),
    data: { from: 1, to: 2, changes: [{ label: "Transport auto-pay limit", before: 3_000, after: 4_000 }] },
  });

  await paid({ circleId: circle.id, currency, payee: pharmacy, amountMinor: 2_450, category: "pharmacy", reference: "RX-1033", summary: "Mum's cholesterol tablets.", at: daysAgo(12, 15), mandate: DEFAULT_MANDATE });
  // The same bill again. Tend flagged it as a duplicate; Tunde approved it at 1am Toronto time.
  await paid({
    circleId: circle.id, currency, payee: pharmacy, amountMinor: 2_450, category: "pharmacy", reference: "RX-1033",
    summary: "Mum's cholesterol tablets.", at: daysAgo(11, 6), mandate: DEFAULT_MANDATE, approvers: [tunde], duplicate: true,
  });

  await refusedScam(circle.id, currency, daysAgo(9, 17));
  await paid({ circleId: circle.id, currency, payee: taxi, amountMinor: 2_200, category: "transport", reference: "T-4471", summary: "Mum's taxi home from church.", at: daysAgo(6, 18), mandate: DEFAULT_MANDATE });
  await contribute(circle.id, currency, tunde, 20_000, "checkout", daysAgo(4, 2));

  // A shop Mum found that nobody has checked yet.
  await db.insert(schema.payees).values({
    circleId: circle.id,
    name: "Bayou Medical Supply",
    aliases: ["Bayou Medical"],
    kind: "equipment",
    paypalEmail: env("SANDBOX_SHOP_EMAIL", "orders@tend-payees.example.com"),
    verified: false,
    addedBy: mum.id,
    createdAt: daysAgo(2, 15),
  });

  return base;
}

async function contribute(circleId: string, currency: string, m: Member, amountMinor: number, source: "checkout" | "invoice", at: Date) {
  const db = await getDb();
  const [c] = await db
    .insert(schema.contributions)
    .values({ circleId, memberId: m.id, amountMinor, currency, source, status: "completed", createdAt: at })
    .returning();
  await db.insert(schema.ledgerEntries).values({
    circleId,
    type: "contribution",
    amountMinor,
    memberId: m.id,
    contributionId: c.id,
    description: source === "invoice" ? `${m.name} paid their share` : `${m.name} topped up the pot`,
    createdAt: at,
  });
}

async function paid(o: {
  circleId: string;
  currency: string;
  payee: Payee;
  amountMinor: number;
  category: Category;
  reference: string;
  summary: string;
  at: Date;
  mandate: Mandate;
  approvers?: Member[];
  duplicate?: boolean;
}) {
  const db = await getDb();
  const evaluation = evaluate(
    {
      amountMinor: o.amountMinor,
      currency: o.currency,
      category: o.category,
      method: "paypal",
      payee: { id: o.payee.id, name: o.payee.name, verified: true, previouslyPaid: true },
      reference: o.reference,
      scam: CLEAN,
      duplicateOfIntentId: o.duplicate ? "seed" : null,
    },
    o.mandate,
    { potBalanceMinor: 1_000_000, spentThisMonthMinor: {} },
    o.currency,
  );
  const settled = new Date(o.at.getTime() + 4 * 60_000);
  const [intent] = await db
    .insert(schema.paymentIntents)
    .values({
      circleId: o.circleId,
      payeeId: o.payee.id,
      payeeName: o.payee.name,
      amountMinor: o.amountMinor,
      currency: o.currency,
      category: o.category,
      method: "paypal",
      reference: o.reference,
      summary: o.summary,
      decision: evaluation.decision,
      evaluation,
      approvalsRequired: evaluation.approvalsRequired,
      status: "paid",
      paypalBatchId: `SEED-BATCH-${o.reference}${o.duplicate ? "-2" : ""}`,
      paypalTransactionId: `SEED-TX-${o.reference}${o.duplicate ? "-2" : ""}`,
      createdAt: o.at,
      updatedAt: settled,
    })
    .returning();
  await db.insert(schema.auditEvents).values({ circleId: o.circleId, intentId: intent.id, actor: "agent", type: "decided", data: { evaluation }, createdAt: o.at });
  let t = o.at.getTime();
  for (const a of o.approvers ?? []) {
    t += 47 * 60_000;
    await db.insert(schema.approvals).values({ intentId: intent.id, memberId: a.id, verdict: "approve", createdAt: new Date(t) });
    await db.insert(schema.auditEvents).values({ circleId: o.circleId, intentId: intent.id, actor: `member:${a.id}`, type: "approved", data: {}, createdAt: new Date(t) });
  }
  const sent = new Date(t + 60_000);
  await db.insert(schema.auditEvents).values([
    { circleId: o.circleId, intentId: intent.id, actor: "agent", type: "payout_sent", data: { seed: true }, createdAt: sent },
    { circleId: o.circleId, intentId: intent.id, actor: "paypal", type: "payout_succeeded", data: { seed: true }, createdAt: new Date(sent.getTime() + 5_000) },
  ]);
  await db.insert(schema.ledgerEntries).values({
    circleId: o.circleId,
    type: "payment",
    amountMinor: -o.amountMinor,
    intentId: intent.id,
    description: `${o.payee.name} — ${o.summary}`,
    createdAt: sent,
  });
  return intent;
}

async function refusedScam(circleId: string, currency: string, at: Date) {
  const db = await getDb();
  const scam: ScamSignals = { impersonation: true, urgency: true, secrecy: true, unusualMethod: true, unsolicited: true, riskScore: 0.97 };
  const evaluation = evaluate(
    {
      amountMinor: 150_000,
      currency,
      category: "other",
      method: "gift_card",
      payee: { id: null, name: "Unknown number claiming to be her grandson", verified: false, previouslyPaid: false },
      reference: null,
      scam,
    },
    DEFAULT_MANDATE,
    { potBalanceMinor: 60_000, spentThisMonthMinor: {} },
    currency,
  );
  const text =
    "Grandma its me, I lost my phone this is my new number. I'm in trouble and need $1,500 today. Please don't tell mum. Can you buy Apple gift cards and send me photos of the codes?";
  const [intake] = await db.insert(schema.intakes).values({ circleId, source: "text", text, createdAt: at }).returning();
  const [intent] = await db
    .insert(schema.paymentIntents)
    .values({
      circleId,
      intakeId: intake.id,
      payeeName: "Unknown number claiming to be her grandson",
      amountMinor: 150_000,
      currency,
      category: "other",
      method: "gift_card",
      summary: "Someone saying they're your grandson and asking for gift cards.",
      decision: evaluation.decision,
      evaluation,
      status: "refused",
      createdAt: at,
      updatedAt: at,
    })
    .returning();
  await db.insert(schema.auditEvents).values({ circleId, intentId: intent.id, actor: "agent", type: "decided", data: { evaluation }, createdAt: at });
  await db.insert(schema.alerts).values({
    circleId,
    intentId: intent.id,
    severity: "danger",
    title: "Tend refused a $1,500 request to Mum",
    body: "A text claiming to be her grandson asked for Apple gift cards and secrecy. Nothing was paid.",
    createdAt: at,
  });
}

/**
 * Walter, 84, lives alone in Tucson. He has no children. His circle is his
 * niece Priya in Seattle and his neighbour Dolores next door. There's no
 * shared pot: Walter pays his own bills from his own PayPal, and Tend gives
 * Priya and Dolores time to look at anything unusual before it leaves.
 */
export async function seedWalter(opts: { history?: boolean } = { history: true }) {
  const db = await getDb();
  const currency = appCurrency();
  const [circle] = await db
    .insert(schema.circles)
    .values({
      name: "Walter's circle",
      careRecipientName: "Walter",
      currency,
      potEnabled: false,
      story: "Walter, 84, lives alone in Tucson and has no children. His niece in Seattle and his neighbour Dolores are his second key.",
    })
    .returning();
  const [walter, priya, dolores] = await db
    .insert(schema.members)
    .values([
      { circleId: circle.id, name: "Walter", role: "care_recipient", email: env("SANDBOX_WALTER_EMAIL", "walter@tend-family.example.com"), city: "Tucson", timezone: "America/Phoenix", color: "brass", homeCurrency: currency },
      { circleId: circle.id, name: "Priya", role: "owner", relation: "niece", email: env("SANDBOX_PRIYA_EMAIL", "priya@tend-family.example.com"), city: "Seattle", timezone: "America/Los_Angeles", color: "teal", homeCurrency: currency },
      { circleId: circle.id, name: "Dolores", role: "sibling", relation: "neighbour", email: env("SANDBOX_DOLORES_EMAIL", "dolores@tend-family.example.com"), city: "Tucson", timezone: "America/Phoenix", color: "rust", homeCurrency: currency },
    ])
    .returning();
  const [pharmacy, electric, housekeeper] = await db
    .insert(schema.payees)
    .values([
      { circleId: circle.id, name: "Saguaro Pharmacy", aliases: ["Saguaro Rx", "Saguaro Drug"], kind: "pharmacy", paypalEmail: env("SANDBOX_PHARMACY_EMAIL", "saguaro@tend-payees.example.com"), verified: true, verifiedBy: priya.id, verifiedAt: daysAgo(70), addedBy: priya.id },
      { circleId: circle.id, name: "Desert Sun Electric", aliases: ["Desert Sun"], kind: "utilities", paypalEmail: env("SANDBOX_CARER_EMAIL", "billing@desertsun.example.com"), verified: true, verifiedBy: priya.id, verifiedAt: daysAgo(70), addedBy: priya.id },
      { circleId: circle.id, name: "Rosa Delgado", aliases: ["Rosa", "Rosa's Housekeeping"], kind: "carer", paypalEmail: env("SANDBOX_TAXI_EMAIL", "rosa@tend-payees.example.com"), verified: true, verifiedBy: dolores.id, verifiedAt: daysAgo(65), addedBy: dolores.id },
    ])
    .returning();
  const mandate: Mandate = { ...DEFAULT_MANDATE, largePaymentApprovals: 1, defaultApprovals: 1 };
  await db.insert(schema.mandates).values({ circleId: circle.id, version: 1, rules: mandate, createdBy: priya.id, createdAt: daysAgo(70) });
  if (!opts.history) return { circle, members: { walter, priya, dolores } };

  const own = async (o: {
    payee: { id: string | null; name: string; email: string; verified: boolean };
    amountMinor: number;
    category: Category;
    summary: string;
    reference: string | null;
    at: Date;
    status: "paid" | "voided" | "refused";
    previouslyPaid: boolean;
    scam?: ScamSignals;
    method?: "paypal" | "gift_card";
    stoppedBy?: Member;
    note?: string;
    text?: string;
    paypalPhoneInNote?: string;
  }) => {
    const proposal = {
      amountMinor: o.amountMinor,
      currency,
      category: o.category,
      method: o.method ?? ("paypal" as const),
      payee: { id: o.payee.id, name: o.payee.name, verified: o.payee.verified, previouslyPaid: o.previouslyPaid },
      reference: o.reference,
      scam: o.scam ?? CLEAN,
      paypalPhoneInNote: o.paypalPhoneInNote ?? null,
    };
    const evaluation = evaluateOwnPayment(proposal, mandate, currency, "Walter");
    const [intake] = await db.insert(schema.intakes).values({ circleId: circle.id, submittedBy: walter.id, source: "text", text: o.text ?? null, createdAt: o.at }).returning();
    const [intent] = await db
      .insert(schema.paymentIntents)
      .values({
        circleId: circle.id,
        intakeId: intake.id,
        payeeId: o.payee.id,
        payeeName: o.payee.name,
        payeeEmail: o.payee.email,
        amountMinor: o.amountMinor,
        currency,
        category: o.category,
        method: o.method ?? "paypal",
        reference: o.reference,
        summary: o.summary,
        decision: evaluation.decision,
        evaluation,
        approvalsRequired: evaluation.approvalsRequired,
        status: o.status,
        funding: "own",
        payerId: walter.id,
        paypalOrderId: o.status === "refused" ? null : `SEED-ORDER-${o.at.getTime()}`,
        paypalAuthorizationId: o.status === "refused" ? null : `SEED-AUTH-${o.at.getTime()}`,
        paypalCaptureId: o.status === "paid" ? `SEED-CAPTURE-${o.at.getTime()}` : null,
        paypalBatchId: o.status === "paid" ? `SEED-BATCH-${o.at.getTime()}` : null,
        holdUntil: evaluation.decision === "cool_off" ? new Date(o.at.getTime() + 24 * 3600_000) : null,
        releasedAt: o.status === "paid" ? new Date(o.at.getTime() + (evaluation.decision === "cool_off" ? 24 * 3600_000 : 60_000)) : null,
        stoppedBy: o.stoppedBy?.id ?? null,
        createdAt: o.at,
        updatedAt: o.at,
      })
      .returning();
    const t = (m: number) => new Date(o.at.getTime() + m * 60_000);
    await db.insert(schema.auditEvents).values({ circleId: circle.id, intentId: intent.id, actor: "agent", type: "decided", data: { evaluation, own: true }, createdAt: o.at });
    if (o.status !== "refused") {
      await db.insert(schema.auditEvents).values({ circleId: circle.id, intentId: intent.id, actor: "paypal", type: "authorized", data: { seed: true }, createdAt: t(2) });
    }
    if (evaluation.decision === "cool_off" && o.status !== "refused") {
      await db.insert(schema.auditEvents).values({ circleId: circle.id, intentId: intent.id, actor: "agent", type: "held", data: { seed: true }, createdAt: t(2) });
    }
    if (o.status === "voided" && o.stoppedBy) {
      await db.insert(schema.auditEvents).values({ circleId: circle.id, intentId: intent.id, actor: `member:${o.stoppedBy.id}`, type: "stopped", data: { note: o.note }, createdAt: t(95) });
      await db.insert(schema.alerts).values({
        circleId: circle.id,
        intentId: intent.id,
        severity: "info",
        title: `${o.stoppedBy.name} stopped ${formatMoneyPlain(o.amountMinor, currency)} to ${o.payee.name}`,
        body: `Walter's money never left his account. "${o.note}"`,
        createdAt: t(95),
      });
    }
    if (o.status === "paid") {
      await db.insert(schema.auditEvents).values([
        { circleId: circle.id, intentId: intent.id, actor: "agent", type: "released", data: { seed: true }, createdAt: t(evaluation.decision === "cool_off" ? 1440 : 3) },
        { circleId: circle.id, intentId: intent.id, actor: "paypal", type: "payout_succeeded", data: { seed: true }, createdAt: t(evaluation.decision === "cool_off" ? 1441 : 4) },
      ]);
    }
    if (o.status === "refused") {
      await db.insert(schema.alerts).values({ circleId: circle.id, intentId: intent.id, severity: "danger", title: `Tend stopped a ${formatMoneyPlain(o.amountMinor, currency)} payment from Walter`, body: o.summary, createdAt: o.at });
    }
    return intent;
  };

  await own({ payee: { id: pharmacy.id, name: pharmacy.name, email: pharmacy.paypalEmail, verified: true }, amountMinor: 3_820, category: "pharmacy", summary: "Walter's heart tablets.", reference: "SR-2210", at: daysAgo(34, 17), status: "paid", previouslyPaid: true });
  await own({ payee: { id: electric.id, name: electric.name, email: electric.paypalEmail, verified: true }, amountMinor: 11_240, category: "utilities", summary: "September electricity.", reference: "DSE-88412", at: daysAgo(21, 16), status: "paid", previouslyPaid: true });
  await own({ payee: { id: housekeeper.id, name: housekeeper.name, email: housekeeper.paypalEmail, verified: true }, amountMinor: 9_000, category: "carer", summary: "Rosa's cleaning, two visits.", reference: null, at: daysAgo(9, 15), status: "paid", previouslyPaid: true });
  await own({
    payee: { id: null, name: "Ridgeline Roofing", email: "ridgeline.roof.deposits@example.com", verified: false },
    amountMinor: 185_000,
    category: "other",
    summary: "A deposit for a roof repair, asked for by a man who knocked on the door.",
    reference: null,
    at: daysAgo(5, 18),
    status: "voided",
    previouslyPaid: false,
    scam: { impersonation: false, urgency: true, secrecy: false, unusualMethod: false, unsolicited: true, riskScore: 0.45 },
    stoppedBy: dolores,
    note: "I called the number on their truck. They've never heard of this job.",
    text: "Roof guy came by, says storm damage, needs $1,850 deposit today to get on the schedule. Pay to ridgeline.roof.deposits@example.com",
  });
  await own({
    payee: { id: null, name: "Geek Squad Total Protection", email: "", verified: false },
    paypalPhoneInNote: "+1 (808) 555-0199",
    amountMinor: 49_999,
    category: "other",
    summary: "A real PayPal invoice for \"Geek Squad renewal\" with a phone number to call. Walter never ordered it.",
    reference: "INV-GS-20931",
    at: daysAgo(2, 15),
    status: "refused",
    previouslyPaid: false,
    scam: { impersonation: true, urgency: true, secrecy: false, unusualMethod: false, unsolicited: true, riskScore: 0.96 },
    text: "PayPal: You have a new invoice from Geek Squad Total Protection for $499.99. If you did not authorize this renewal, call +1 (808) 555-0199 within 12 hours to cancel.",
  });
  await own({ payee: { id: pharmacy.id, name: pharmacy.name, email: pharmacy.paypalEmail, verified: true }, amountMinor: 3_820, category: "pharmacy", summary: "Walter's heart tablets.", reference: "SR-2298", at: daysAgo(4, 17), status: "paid", previouslyPaid: true });

  return { circle, members: { walter, priya, dolores } };
}

const formatMoneyPlain = (minor: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);

/** Both demo circles, with history: the Okafor family and Walter. */
export async function seedAll() {
  const okafor = await seedDemo({ history: true });
  const walter = await seedWalter();
  return { okafor, walter };
}
