import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { alert, audit, getCircle, getMember, listPayees, normaliseName } from "./circle";
import { sendPayout, getPayoutBatch, isSimulatedId, PayPalError } from "./paypal/rest";
import { reevaluateIntent } from "./agent/pipeline";
import { maybeRelease } from "./agent/approvals";
import { isFamily } from "./people";
import type { Payee } from "./db/schema";

const { payees, paymentIntents, ledgerEntries } = schema;

export class PayeeError extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function familyMember(memberId: string) {
  const m = await getMember(memberId);
  const circle = await getCircle();
  if (!m || m.circleId !== circle.id || !isFamily(m)) throw new PayeeError("Only people in the circle can manage payees.");
  return { m, circle };
}

/** Who Tend may pay. New payees start unverified unless a family member vouches for them. */
export async function addPayee(opts: {
  memberId: string;
  name: string;
  paypalEmail: string;
  kind: string;
  aliases?: string[];
}): Promise<Payee> {
  const { m, circle } = await familyMember(opts.memberId);
  const name = opts.name.trim();
  const email = opts.paypalEmail.trim().toLowerCase();
  if (!name) throw new PayeeError("Give the payee a name.");
  if (!EMAIL.test(email)) throw new PayeeError("That doesn't look like an email address.");
  const existing = await listPayees(circle.id);
  if (existing.some((p) => p.paypalEmail.toLowerCase() === email)) throw new PayeeError("A payee with that PayPal email already exists.");
  if (existing.some((p) => normaliseName(p.name) === normaliseName(name))) throw new PayeeError(`${name} is already a payee.`);

  const db = await getDb();
  const [p] = await db
    .insert(payees)
    .values({ circleId: circle.id, name, paypalEmail: email, kind: opts.kind, aliases: opts.aliases ?? [], verified: false, addedBy: m.id })
    .returning();
  await audit(circle.id, `member:${m.id}`, "payee_added", { payeeId: p.id, name, kind: opts.kind });
  return p;
}

/**
 * Send one cent to the payee's PayPal account with a code in the note. The
 * family asks the payee (or checks the sandbox account) what code arrived.
 * Tend never pays someone the family hasn't verified.
 */
export async function sendVerificationCent(payeeId: string, memberId: string) {
  const { m, circle } = await familyMember(memberId);
  const db = await getDb();
  const [p] = await db.select().from(payees).where(and(eq(payees.id, payeeId), eq(payees.circleId, circle.id)));
  if (!p) throw new PayeeError("Payee not found.");
  if (p.verified) throw new PayeeError(`${p.name} is already verified.`);

  const code = String(1000 + Math.floor(Math.random() * 9000));
  const ref = `verify-${p.id.slice(0, 8)}-${Date.now().toString(36)}`;
  let batchId: string;
  try {
    ({ batchId } = await sendPayout({
      intentId: ref,
      receiverEmail: p.paypalEmail,
      amountMinor: 1,
      currency: circle.currency,
      note: `Tend verification code ${code}. ${m.name} is checking this is the right PayPal account for ${p.name}.`,
    }));
  } catch (e) {
    throw new PayeeError(e instanceof PayPalError ? `PayPal didn't accept it: ${e.body.slice(0, 200)}` : String(e));
  }
  await db.update(payees).set({ verificationCode: code, verificationSentAt: new Date() }).where(eq(payees.id, p.id));
  await db.insert(ledgerEntries).values({
    circleId: circle.id,
    type: "verification",
    amountMinor: -1,
    memberId: m.id,
    description: `One-cent check to ${p.name}`,
  });
  await audit(circle.id, `member:${m.id}`, "verification_sent", { payeeId: p.id, batchId, simulated: isSimulatedId(batchId) });
  // Sandbox settles fast; don't block on it.
  if (!isSimulatedId(batchId)) void getPayoutBatch(batchId).catch(() => undefined);
  return { simulated: isSimulatedId(batchId), code: isSimulatedId(batchId) ? code : null };
}

/** The family types the code the payee saw. Right code → verified. */
export async function confirmVerification(payeeId: string, memberId: string, code: string) {
  const { m, circle } = await familyMember(memberId);
  const db = await getDb();
  const [p] = await db.select().from(payees).where(and(eq(payees.id, payeeId), eq(payees.circleId, circle.id)));
  if (!p?.verificationCode) throw new PayeeError("Send the one-cent check first.");
  if (p.verificationCode !== code.trim()) {
    await audit(circle.id, `member:${m.id}`, "verification_mismatch", { payeeId: p.id });
    throw new PayeeError("That code doesn't match. Double-check the PayPal account before trying again.");
  }
  await db.update(payees).set({ verified: true, verifiedAt: new Date(), verifiedBy: m.id, verificationCode: null }).where(eq(payees.id, p.id));
  await audit(circle.id, `member:${m.id}`, "payee_verified", { payeeId: p.id, how: "cent" });
  await alert(circle.id, "info", `${p.name} verified`, `${m.name} confirmed the one-cent check arrived. Tend can now pay them.`);
  await reevaluateWaitingFor(p.id);
  return p;
}

/** A family member vouches for the payee directly (e.g. they set up the account themselves). */
export async function vouchForPayee(payeeId: string, memberId: string) {
  const { m, circle } = await familyMember(memberId);
  const db = await getDb();
  const [p] = await db
    .update(payees)
    .set({ verified: true, verifiedAt: new Date(), verifiedBy: m.id, verificationCode: null })
    .where(and(eq(payees.id, payeeId), eq(payees.circleId, circle.id)))
    .returning();
  if (!p) throw new PayeeError("Payee not found.");
  await audit(circle.id, `member:${m.id}`, "payee_verified", { payeeId: p.id, how: "vouched" });
  await reevaluateWaitingFor(p.id);
  return p;
}

/**
 * The approval card's "Add as payee": attach a new (or existing) payee to a
 * waiting payment and run the mandate again.
 */
export async function attachPayee(opts: {
  intentId: string;
  memberId: string;
  payeeId?: string;
  newPayee?: { name: string; paypalEmail: string; kind: string; vouch: boolean };
}) {
  const db = await getDb();
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, opts.intentId));
  if (!intent) throw new PayeeError("Payment not found.");
  let payeeId = opts.payeeId;
  if (opts.newPayee) {
    const p = await addPayee({
      memberId: opts.memberId,
      name: opts.newPayee.name,
      paypalEmail: opts.newPayee.paypalEmail,
      kind: opts.newPayee.kind,
      aliases: intent.payeeName && normaliseName(intent.payeeName) !== normaliseName(opts.newPayee.name) ? [intent.payeeName] : [],
    });
    if (opts.newPayee.vouch) await vouchForPayee(p.id, opts.memberId);
    payeeId = p.id;
  }
  if (!payeeId) throw new PayeeError("Choose a payee.");
  await db.update(paymentIntents).set({ payeeId, updatedAt: new Date() }).where(eq(paymentIntents.id, intent.id));
  await audit(intent.circleId, `member:${opts.memberId}`, "payee_attached", { payeeId }, intent.id);
  await reevaluateIntent(intent.id);
  return maybeRelease(intent.id);
}

async function reevaluateWaitingFor(payeeId: string) {
  const db = await getDb();
  const waiting = await db
    .select({ id: paymentIntents.id })
    .from(paymentIntents)
    .where(and(eq(paymentIntents.payeeId, payeeId), sql`${paymentIntents.status} in ('awaiting_approval','on_hold')`));
  for (const w of waiting) {
    await reevaluateIntent(w.id);
    await maybeRelease(w.id);
  }
}

/** Payees with how much Tend has paid each. */
export async function payeeSummaries(circleId: string) {
  const db = await getDb();
  const list = await listPayees(circleId);
  const totals = await db
    .select({
      payeeId: paymentIntents.payeeId,
      paid: sql<string>`coalesce(sum(${paymentIntents.amountMinor}) filter (where ${paymentIntents.status} = 'paid'), 0)`,
      count: sql<string>`count(*) filter (where ${paymentIntents.status} = 'paid')`,
      last: sql<string | null>`max(${paymentIntents.createdAt}) filter (where ${paymentIntents.status} = 'paid')`,
    })
    .from(paymentIntents)
    .where(eq(paymentIntents.circleId, circleId))
    .groupBy(paymentIntents.payeeId);
  return list
    .map((p) => {
      const t = totals.find((x) => x.payeeId === p.id);
      return { payee: p, paidMinor: Number(t?.paid ?? 0), paidCount: Number(t?.count ?? 0), lastPaidAt: t?.last ? new Date(t.last) : null };
    })
    .sort((a, b) => Number(b.payee.verified) - Number(a.payee.verified) || b.paidMinor - a.paidMinor);
}

