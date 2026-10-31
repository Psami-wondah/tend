import { and, eq, inArray, lte } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { activeMandate, alert, audit, getCircleById, getMember, getMembers, listPayees, matchPayee } from "./circle";
import { evaluateOwnPayment } from "./mandate/engine";
import type { PaymentProposal } from "./mandate/types";
import { awakeSentence, paypalScamMessage, read } from "./agent/pipeline";
import { load, refreshPayout, transition } from "./agent/executor";
import {
  authorizationFromOrder,
  authorizeOrder,
  captureAuthorization,
  createAuthorizeOrder,
  isSimulatedId,
  PayPalError,
  sendPayout,
  voidAuthorization,
} from "./paypal/rest";
import { formatMoney, toMinor } from "./money";
import { isFamily, joinNames } from "./people";
import type { Extraction } from "./agent/schemas";
import type { Member, PaymentIntent } from "./db/schema";

const { intakes, paymentIntents } = schema;

/**
 * The person's own money, a second key for the people they trust.
 *
 * Tend never takes the person's money away from them. It buys their circle
 * time. They pay from their own PayPal; Tend authorizes the payment instead
 * of sending it, so the money is held in their account:
 *
 *   routine payment        → captured straight away
 *   unusual (new payee,    → held for the cooling-off period; anyone in the
 *   big, duplicate)          circle can stop it (void) or let it go (capture);
 *                            if nobody objects, Tend captures when it ends
 *   warning signs or very  → held until one person in the circle says yes
 *   large
 *   gift cards, crypto,    → refused before any order exists
 *   wire, clear scams
 *
 * On release Tend captures the authorization and forwards it to the payee by
 * PayPal Payout. A stopped payment is voided: nothing ever left their account.
 */

export type OwnOutcome = "approve" | "paid" | "held" | "refused" | "warning" | "nothing_to_pay" | "need_payee" | "failed";

export interface OwnStart {
  outcome: OwnOutcome;
  message: string;
  intent?: PaymentIntent;
  orderId?: string;
  /** For the confirm screen: what will happen once they approve. */
  plan?: { decision: string; holdHours: number; reasons: string[] };
}

export class OwnPaymentError extends Error {}

async function payer(memberId: string): Promise<Member> {
  const m = await getMember(memberId);
  if (!m || m.role !== "care_recipient") throw new OwnPaymentError("Only the person whose money it is can pay from their own PayPal.");
  return m;
}

/** Have they paid this payee (by id or by PayPal email) before, from anywhere? */
async function paidBefore(circleId: string, payeeId: string | null, email: string | null): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ payeeId: paymentIntents.payeeId, payeeEmail: paymentIntents.payeeEmail })
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circleId), eq(paymentIntents.status, "paid")));
  return rows.some((r) => (payeeId && r.payeeId === payeeId) || (email && r.payeeEmail?.toLowerCase() === email.toLowerCase()));
}

type Payees = Awaited<ReturnType<typeof listPayees>>;

/** The mandate's view of a payment, from what Claude (or the keyword reader) read. */
async function proposalFor(circle: { id: string; currency: string }, extraction: Extraction & { amount: number }, payeeList: Payees, payToEmail?: string | null) {
  const payee = matchPayee(payeeList, extraction.payeeName, extraction.payeeEmail);
  const payeeEmail = payee?.paypalEmail ?? extraction.payeeEmail ?? payToEmail?.trim() ?? null;
  const proposal: PaymentProposal = {
    amountMinor: toMinor(extraction.amount),
    currency: (extraction.currency || circle.currency).toUpperCase(),
    category: extraction.category,
    method: extraction.method,
    payee: {
      id: payee?.id ?? null,
      name: payee?.name ?? (extraction.payeeName || "someone new"),
      verified: payee?.verified ?? false,
      previouslyPaid: await paidBefore(circle.id, payee?.id ?? null, payeeEmail),
    },
    reference: extraction.reference,
    scam: extraction.scam,
    paypalPhoneInNote: extraction.paypalNative?.phoneInNote ?? null,
  };
  return { proposal, payeeEmail };
}

/**
 * What Tend would do if the person paid this from their own PayPal, without
 * saving anything or touching PayPal. Backs the MCP server's check tool.
 */
export async function previewOwnPayment(circleId: string, text: string) {
  const circle = await getCircleById(circleId);
  const payeeList = await listPayees(circle.id);
  const extraction = await read({ source: "text", text }, circle, payeeList);
  const mandate = await activeMandate(circle.id);
  const names = joinNames((await getMembers(circle.id)).filter(isFamily).map((m) => m.name));
  if (!extraction.isPaymentRequest || extraction.amount === null) {
    return { extraction, decision: null, reasons: [], holdHours: 0, paypalScam: paypalScamMessage(extraction, names) };
  }
  const { proposal } = await proposalFor(circle, { ...extraction, amount: extraction.amount }, payeeList);
  const evaluation = evaluateOwnPayment(proposal, mandate, circle.currency, circle.careRecipientName);
  return { extraction, proposal, decision: evaluation.decision, reasons: evaluation.reasons, holdHours: evaluation.holdHours, paypalScam: paypalScamMessage(extraction, names) };
}

/** Read what they want to pay, decide, and prepare the PayPal order for them to approve. */
export async function startOwnPayment(input: {
  payerId: string;
  source: "photo" | "voice" | "text";
  text?: string | null;
  imageDataUrl?: string | null;
  sampleId?: string | null;
  payToEmail?: string | null;
  preExtracted?: Extraction;
}): Promise<OwnStart> {
  const db = await getDb();
  const me = await payer(input.payerId);
  const circle = await getCircleById(me.circleId);
  const payeeList = await listPayees(circle.id);
  const circleMembers = (await getMembers(circle.id)).filter(isFamily);
  const names = joinNames(circleMembers.map((m) => m.name));

  const [intake] = await db
    .insert(intakes)
    .values({ circleId: circle.id, submittedBy: me.id, source: input.source, text: input.text ?? null, imageDataUrl: input.imageDataUrl ?? null })
    .returning();
  const extraction = input.preExtracted ?? (await read(input, circle, payeeList));
  await db.update(intakes).set({ extraction }).where(eq(intakes.id, intake.id));
  await audit(circle.id, "agent", "intake_read", { intakeId: intake.id, extraction, own: true });

  const mandate = await activeMandate(circle.id);
  if (!extraction.isPaymentRequest || extraction.amount === null) {
    if (extraction.scam.riskScore >= mandate.scamReviewThreshold) {
      await alert(circle.id, "danger", `Possible scam sent to ${me.name}`, extraction.scam.explanation);
      return { outcome: "warning", message: paypalScamMessage(extraction, names) ?? `Please be careful with this one. ${extraction.scam.explanation} I've let ${names} know.` };
    }
    return { outcome: "nothing_to_pay", message: `I read it, and there's nothing to pay. ${extraction.summary}`.trim() };
  }

  const { proposal, payeeEmail } = await proposalFor(circle, { ...extraction, amount: extraction.amount }, payeeList, input.payToEmail);
  const amountMinor = proposal.amountMinor;
  const payee = proposal.payee.id ? payeeList.find((p) => p.id === proposal.payee.id) ?? null : null;
  const evaluation = evaluateOwnPayment(proposal, mandate, circle.currency, me.name);
  const amount = formatMoney(amountMinor, circle.currency);

  const base = {
    circleId: circle.id,
    intakeId: intake.id,
    payeeId: proposal.payee.id,
    payeeName: proposal.payee.name,
    amountMinor,
    currency: proposal.currency,
    category: proposal.category,
    method: proposal.method,
    reference: extraction.reference,
    summary: extraction.summary,
    decision: evaluation.decision,
    evaluation,
    approvalsRequired: evaluation.approvalsRequired,
    funding: "own" as const,
    payerId: me.id,
    payeeEmail,
  };

  if (evaluation.decision === "refuse") {
    const [refused] = await db.insert(paymentIntents).values({ ...base, status: "refused" }).returning();
    await audit(circle.id, "agent", "decided", { proposal, evaluation, own: true }, refused.id);
    await alert(circle.id, "danger", `Tend stopped a ${amount} payment from ${me.name}`, `${evaluation.reasons[0]?.message ?? ""} ${extraction.scam.explanation}`, refused.id);
    return {
      outcome: "refused",
      intent: refused,
      message: paypalScamMessage(extraction, names) ?? `I haven't paid this. ${evaluation.reasons[0]?.message ?? ""} Please don't send them anything another way. I've let ${names} know.`,
    };
  }

  if (!payeeEmail) {
    return { outcome: "need_payee", message: `Who should the ${amount} go to? I need their PayPal email address. You'll find it on the bill, or ask them.` };
  }

  const [intent] = await db.insert(paymentIntents).values({ ...base, status: "awaiting_payer" }).returning();
  await audit(circle.id, "agent", "decided", { proposal, evaluation, own: true, holdHours: evaluation.holdHours }, intent.id);

  const plan = { decision: evaluation.decision, holdHours: evaluation.holdHours, reasons: evaluation.reasons.map((r) => r.message) };

  // Saved wallet (PayPal Vault) and a payee they've agreed to: no PayPal screen needed.
  const consent = me.vaultConsent;
  if (me.vaultTokenId && consent && payee && consent.payeeIds.includes(payee.id) && amountMinor <= consent.maxPerPaymentMinor) {
    const order = await createAuthorizeOrder({ intentId: intent.id, amountMinor, currency: intent.currency, description: `${me.name} to ${intent.payeeName}`, vaultId: me.vaultTokenId });
    await db.update(paymentIntents).set({ paypalOrderId: order.id }).where(eq(paymentIntents.id, intent.id));
    await audit(circle.id, "agent", "vault_charge", { orderId: order.id }, intent.id);
    const auth = authorizationFromOrder(order) ?? (await authorizeOrder(order.id));
    return afterAuthorized(intent.id, auth.id, auth.expiresAt);
  }

  const order = await createAuthorizeOrder({ intentId: intent.id, amountMinor, currency: intent.currency, description: `${me.name} to ${intent.payeeName}` });
  await db.update(paymentIntents).set({ paypalOrderId: order.id }).where(eq(paymentIntents.id, intent.id));
  return {
    outcome: "approve",
    intent: await load(intent.id),
    orderId: order.id,
    plan,
    message: planSentence(evaluation.decision, evaluation.holdHours, intent.payeeName, amount, names, joinNames(circleMembers.map((m) => m.name), "or")),
  };
}

function holdText(hours: number) {
  return hours % 24 === 0 ? (hours === 24 ? "a day" : `${hours / 24} days`) : `${hours} hours`;
}

function planSentence(decision: string, hours: number, payee: string, amount: string, names: string, either: string) {
  if (decision === "auto_pay") return `Approve it in PayPal and ${amount} goes to ${payee} straight away.`;
  if (decision === "cool_off") return `Approve it in PayPal. I'll hold the ${amount} in your account for ${holdText(hours)} before it goes to ${payee}, so ${names} can take a look. You can still change your mind.`;
  return `Approve it in PayPal. I'll hold the ${amount} in your account until ${either} says yes. If nobody does within ${holdText(hours)}, it's cancelled and nothing leaves.`;
}

/** They approved in PayPal: place the authorization (the hold). */
export async function confirmOwnPayment(intentId: string, orderId: string): Promise<OwnStart> {
  const intent = await load(intentId);
  if (intent.funding !== "own" || intent.status !== "awaiting_payer") throw new OwnPaymentError(`This payment is already ${intent.status === "voided" ? "stopped" : intent.status.replace("_", " ")}.`);
  if (intent.paypalOrderId !== orderId) throw new OwnPaymentError("That PayPal order doesn't belong to this payment.");
  let auth;
  try {
    auth = await authorizeOrder(orderId);
  } catch (e) {
    const reason = e instanceof PayPalError ? e.body.slice(0, 300) : String(e);
    await failOwn(intent, `PayPal didn't authorize it: ${reason}`);
    return { outcome: "failed", message: "PayPal didn't accept that. Nothing was taken from your account. Please try again in a minute." };
  }
  return afterAuthorized(intentId, auth.id, auth.expiresAt);
}

async function afterAuthorized(intentId: string, authorizationId: string, expiresAt: string | null): Promise<OwnStart> {
  const db = await getDb();
  const intent = await load(intentId);
  const circle = await getCircleById(intent.circleId);
  const me = intent.payerId ? await getMember(intent.payerId) : null;
  const circleMembers = (await getMembers(circle.id)).filter(isFamily);
  const names = joinNames(circleMembers.map((m) => m.name));
  const amount = formatMoney(intent.amountMinor, intent.currency);
  const holdHours = (intent.evaluation as { holdHours?: number }).holdHours ?? 24;

  await db.update(paymentIntents).set({ paypalAuthorizationId: authorizationId, updatedAt: new Date() }).where(eq(paymentIntents.id, intentId));
  await audit(circle.id, "paypal", "authorized", { authorizationId, expiresAt, simulated: isSimulatedId(authorizationId) }, intentId);

  if (intent.decision === "auto_pay") {
    const paid = await releaseOwnPayment(intentId, "agent", "routine");
    return {
      outcome: paid.status === "paid" ? "paid" : paid.status === "failed" ? "failed" : "held",
      intent: paid,
      message: paid.status === "failed" ? "PayPal didn't send it. Nothing was taken from your account." : `Done. ${amount} is on its way to ${intent.payeeName}.`,
    };
  }

  // Never hold past PayPal's 3-day honor period for capture.
  const until = new Date(Math.min(Date.now() + holdHours * 3600_000, Date.now() + 71 * 3600_000));
  await db
    .update(paymentIntents)
    .set({ status: "held", holdUntil: until, updatedAt: new Date() })
    .where(and(eq(paymentIntents.id, intentId), eq(paymentIntents.status, "awaiting_payer")));
  const why = intent.evaluation.reasons[0]?.message ?? "";
  const waitingOn = intent.decision === "needs_approval" ? "needs one of you to say yes" : `goes at ${until.toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: me?.timezone ?? "UTC" })} unless one of you stops it`;
  await alert(circle.id, "action", `Held: ${amount} from ${me?.name ?? "them"} to ${intent.payeeName}`, `${why} It ${waitingOn}. ${awakeSentence(circleMembers)}`.trim(), intentId);
  await audit(circle.id, "agent", "held", { holdUntil: until.toISOString(), decision: intent.decision }, intentId);
  return {
    outcome: "held",
    intent: await load(intentId),
    message:
      intent.decision === "needs_approval"
        ? `I'm holding the ${amount} in your account until ${joinNames(circleMembers.map((m) => m.name), "or")} says yes. It hasn't left. ${awakeSentence(circleMembers)}`.trim()
        : `I'm holding the ${amount} in your account for ${holdText(holdHours)}. It hasn't left yet, and ${names} can take a look. After that it goes to ${intent.payeeName}.`,
  };
}

/**
 * Let it go: capture the authorization, then forward it to the payee by
 * Payout. Called when the hold ends, when someone in the circle says yes, or
 * straight away for a routine payment.
 */
export async function releaseOwnPayment(intentId: string, actor: string, why: "routine" | "approved" | "hold_ended"): Promise<PaymentIntent> {
  const db = await getDb();
  const intent = await load(intentId);
  if (intent.funding !== "own" || !intent.paypalAuthorizationId) return intent;
  const from = intent.status === "awaiting_payer" ? "awaiting_payer" : "held";
  if (intent.status !== from) return intent;
  if (!(await transition(intentId, from, "paying"))) return load(intentId); // someone else got there first

  try {
    const capture = await captureAuthorization(intent.paypalAuthorizationId, intent.id);
    await db.update(paymentIntents).set({ paypalCaptureId: capture.id, releasedAt: new Date(), updatedAt: new Date() }).where(eq(paymentIntents.id, intentId));
    await audit(intent.circleId, actor, "released", { why, captureId: capture.id }, intentId);
    const payout = await sendPayout({
      intentId,
      receiverEmail: intent.payeeEmail!,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      note: `Tend · ${intent.summary}${intent.reference ? ` · Ref ${intent.reference}` : ""}`,
    });
    await db.update(paymentIntents).set({ paypalBatchId: payout.batchId, updatedAt: new Date() }).where(eq(paymentIntents.id, intentId));
    await audit(intent.circleId, "agent", "payout_sent", { ...payout, to: intent.payeeEmail, simulated: isSimulatedId(payout.batchId) }, intentId);
    for (let i = 0; i < 4; i++) {
      if (!isSimulatedId(payout.batchId)) await new Promise((r) => setTimeout(r, 1500));
      const after = await refreshPayout(intentId);
      if (after.status !== "paying") return after;
    }
  } catch (e) {
    const reason = e instanceof PayPalError ? e.body : String(e);
    await failOwn(intent, reason.slice(0, 500));
  }
  return load(intentId);
}

/** Stop it: void the authorization. Nothing ever leaves their account. */
export async function stopOwnPayment(intentId: string, memberId: string, note?: string): Promise<PaymentIntent> {
  const db = await getDb();
  const intent = await load(intentId);
  const member = await getMember(memberId);
  if (!member || member.circleId !== intent.circleId) throw new OwnPaymentError("Not part of this circle.");
  if (intent.funding !== "own") throw new OwnPaymentError("This isn't a payment from their own PayPal.");
  if (intent.status !== "held" && intent.status !== "awaiting_payer") throw new OwnPaymentError(`This payment is already ${intent.status.replace("_", " ")}.`);
  if (!(await transition(intentId, intent.status, "voided"))) return load(intentId);
  if (intent.paypalAuthorizationId) {
    try {
      await voidAuthorization(intent.paypalAuthorizationId);
    } catch (e) {
      await audit(intent.circleId, "paypal", "void_failed", { reason: String(e).slice(0, 300) }, intentId);
    }
  }
  await db.update(paymentIntents).set({ stoppedBy: member.id, updatedAt: new Date() }).where(eq(paymentIntents.id, intentId));
  await audit(intent.circleId, `member:${member.id}`, "stopped", { note }, intentId);
  const payerName = intent.payerId ? (await getMember(intent.payerId))?.name : null;
  await alert(
    intent.circleId,
    "info",
    `${member.name} stopped ${formatMoney(intent.amountMinor, intent.currency)} to ${intent.payeeName}`,
    `${payerName ? `${payerName}'s` : "The"} money never left their account.${note ? ` "${note}"` : ""}`,
    intentId,
  );
  return load(intentId);
}

/** Cooling-off over: release what nobody stopped; cancel approvals nobody gave. */
export async function settleDueHolds(now = new Date()) {
  const db = await getDb();
  const due = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.funding, "own"), eq(paymentIntents.status, "held"), lte(paymentIntents.holdUntil, now)));
  const results: { id: string; status: string }[] = [];
  for (const intent of due) {
    if (intent.decision === "cool_off") {
      const r = await releaseOwnPayment(intent.id, "agent", "hold_ended");
      results.push({ id: r.id, status: r.status });
    } else {
      if (await transition(intent.id, "held", "voided")) {
        if (intent.paypalAuthorizationId) await voidAuthorization(intent.paypalAuthorizationId).catch(() => undefined);
        await audit(intent.circleId, "agent", "expired", {}, intent.id);
        await alert(intent.circleId, "info", `${intent.payeeName}: nobody said yes in time`, "Tend cancelled the hold. Nothing left their account.", intent.id);
      }
      results.push({ id: intent.id, status: "voided" });
    }
  }
  return results;
}

/** Own-wallet payments waiting on PayPal approval or held, for the circle's home. */
export async function heldPayments(circleId: string) {
  const db = await getDb();
  return db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circleId), eq(paymentIntents.funding, "own"), inArray(paymentIntents.status, ["held"])));
}

async function failOwn(intent: PaymentIntent, reason: string) {
  const db = await getDb();
  await db.update(paymentIntents).set({ status: "failed", failureReason: reason, updatedAt: new Date() }).where(eq(paymentIntents.id, intent.id));
  await audit(intent.circleId, "agent", "payment_failed", { reason }, intent.id);
  await alert(intent.circleId, "danger", `Couldn't pay ${intent.payeeName}`, reason, intent.id);
}
