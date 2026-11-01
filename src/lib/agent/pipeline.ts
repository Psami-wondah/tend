import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/client";
import { evaluate } from "../mandate/engine";
import type { PaymentProposal, MandateResult } from "../mandate/types";
import { formatMoney, toMinor } from "../money";
import {
  activeMandate,
  alert,
  audit,
  findDuplicate,
  getCircle,
  getMembers,
  listPayees,
  matchPayee,
  payeePreviouslyPaid,
  potBalanceMinor,
  reservedMinor,
  spentThisMonthByCategory,
} from "../circle";
import { extract } from "./intake";
import { executeIntent, load } from "./executor";
import { aiConfigured } from "./model";
import { SAMPLES, heuristicExtract, isSampleId } from "./offline";
import type { Extraction } from "./schemas";
import type { IntentStatus, Member, Payee, PaymentIntent } from "../db/schema";
import { whoIsAwake, localTime } from "../time";
import { isFamily, joinNames } from "../people";

const { intakes, paymentIntents } = schema;

export type Outcome =
  | "paid"
  | "paying"
  | "awaiting_approval"
  | "on_hold"
  | "refused"
  | "warning"
  | "nothing_to_pay"
  | "failed";

export interface IntakeResult {
  outcome: Outcome;
  /** Plain words for the person who sent it in. */
  message: string;
  extraction: Extraction;
  evaluation?: MandateResult;
  intent?: PaymentIntent;
}

const STATUS_FOR: Record<MandateResult["decision"], IntentStatus> = {
  auto_pay: "approved",
  // The pot never cools off; that decision only exists for own-wallet payments.
  cool_off: "awaiting_approval",
  needs_approval: "awaiting_approval",
  hold: "on_hold",
  refuse: "refused",
};

/**
 * Photo / voice / message in → decision out.
 *
 *   AI reads it (extract) → match payee + duplicate check → mandate engine
 *   decides → record intent with reasons → pay, ask the family, or refuse.
 */
export async function handleIntake(input: {
  source: "photo" | "voice" | "text";
  text?: string | null;
  imageDataUrl?: string | null;
  submittedBy?: string | null;
  /** Skip the model read — used when a family member asks Tend directly. */
  preExtracted?: Extraction;
  /** One of the built-in examples; lets demo mode read it without a model. */
  sampleId?: string | null;
}): Promise<IntakeResult> {
  const db = await getDb();
  const circle = await getCircle();
  const payeeList = await listPayees(circle.id);

  const [intake] = await db
    .insert(intakes)
    .values({
      circleId: circle.id,
      submittedBy: input.submittedBy ?? null,
      source: input.source,
      text: input.text ?? null,
      imageDataUrl: input.imageDataUrl ?? null,
    })
    .returning();

  const extraction = input.preExtracted ?? (await read(input, circle, payeeList));
  await db.update(intakes).set({ extraction }).where(eq(intakes.id, intake.id));
  await audit(circle.id, "agent", "intake_read", { intakeId: intake.id, extraction });

  const family = (await getMembers(circle.id)).filter(isFamily);
  const familyNames = joinNames(family.map((m) => m.name));
  const awakeNote = awakeSentence(family);

  // Not a bill — but it might still be a scam worth warning about.
  if (!extraction.isPaymentRequest || extraction.amount === null) {
    if (extraction.scam.riskScore >= (await activeMandate(circle.id)).scamReviewThreshold) {
      await alert(circle.id, "danger", "Possible scam sent to " + circle.careRecipientName, extraction.scam.explanation);
      return {
        outcome: "warning",
        extraction,
        message: paypalScamMessage(extraction, familyNames) ?? `Please be careful with this one. ${extraction.scam.explanation} I've let ${familyNames} know.`,
      };
    }
    return {
      outcome: "nothing_to_pay",
      extraction,
      message: `I read it: ${sentence(extraction.summary)} There's nothing to pay.`,
    };
  }

  const payee = matchPayee(payeeList, extraction.payeeName, extraction.payeeEmail);
  const amountMinor = toMinor(extraction.amount);
  const reference = extraction.reference;

  const proposal: PaymentProposal = {
    amountMinor,
    currency: (extraction.currency || circle.currency).toUpperCase(),
    category: extraction.category,
    method: extraction.method,
    payee: {
      id: payee?.id ?? null,
      name: payee?.name ?? (extraction.payeeName || "Unknown"),
      verified: payee?.verified ?? false,
      previouslyPaid: payee ? await payeePreviouslyPaid(payee.id) : false,
    },
    reference,
    scam: extraction.scam,
    paypalPhoneInNote: extraction.paypalNative?.phoneInNote ?? null,
    duplicateOfIntentId: await findDuplicate({ circleId: circle.id, payeeId: payee?.id ?? null, amountMinor, reference }),
  };

  const mandate = await activeMandate(circle.id);
  const evaluation = evaluate(
    proposal,
    mandate,
    {
      potBalanceMinor: (await potBalanceMinor(circle.id)) - (await reservedMinor(circle.id)),
      spentThisMonthMinor: await spentThisMonthByCategory(circle.id),
    },
    circle.currency,
  );

  const [created] = await db
    .insert(paymentIntents)
    .values({
      circleId: circle.id,
      intakeId: intake.id,
      payeeId: proposal.payee.id,
      payeeName: proposal.payee.name,
      amountMinor,
      currency: proposal.currency,
      category: proposal.category,
      method: proposal.method,
      reference,
      summary: extraction.summary,
      decision: evaluation.decision,
      evaluation,
      approvalsRequired: evaluation.approvalsRequired,
      status: STATUS_FOR[evaluation.decision],
    })
    .returning();
  const { awake, asleep } = whoIsAwake(family);
  await audit(
    circle.id,
    "agent",
    "decided",
    {
      proposal,
      evaluation,
      awake: awake.map((m) => m.name),
      asleep: asleep.map((m) => ({ name: m.name, city: m.city, local: localTime(m.timezone).label })),
    },
    created.id,
  );

  const amount = formatMoney(amountMinor, circle.currency);
  const headline = evaluation.reasons[0]?.message ?? "";
  const summary = sentence(extraction.summary);

  switch (evaluation.decision) {
    case "refuse": {
      await alert(
        circle.id,
        "danger",
        `Tend refused a ${amount} request to ${circle.careRecipientName}`,
        `${headline} ${extraction.scam.explanation}`,
        created.id,
      );
      return {
        outcome: "refused",
        extraction,
        evaluation,
        intent: created,
        message: paypalScamMessage(extraction, familyNames) ?? `I haven't paid this. ${headline} Please don't send them anything. I've let ${familyNames} know.`,
      };
    }
    case "hold": {
      await alert(circle.id, "action", "Pot needs a top-up", `${proposal.payee.name} needs ${amount}. ${headline}`, created.id);
      return {
        outcome: "on_hold",
        extraction,
        evaluation,
        intent: created,
        message: `There isn't quite enough in the care pot for this yet. I've asked ${familyNames} to top it up, and I'll pay as soon as they do. ${awakeNote}`.trim(),
      };
    }
    case "cool_off":
    case "needs_approval": {
      const n = evaluation.approvalsRequired;
      await alert(
        circle.id,
        "action",
        `Approve ${amount} to ${proposal.payee.name}?`,
        `${summary} ${n > 1 ? `Needs ${n} approvals.` : "Needs 1 approval."} ${headline} ${awakeNote}`.trim(),
        created.id,
      );
      return {
        outcome: "awaiting_approval",
        extraction,
        evaluation,
        intent: created,
        message: `Got it — ${summary} I've asked ${familyNames} to OK it, and I'll pay as soon as they do. ${awakeNote}`.trim(),
      };
    }
    case "auto_pay": {
      const after = await executeIntent(created.id);
      return {
        outcome: after.status === "paid" ? "paid" : after.status === "paying" ? "paying" : after.status === "failed" ? "failed" : "on_hold",
        extraction,
        evaluation,
        intent: after,
        message:
          after.status === "paid"
            ? `Done. I've paid ${proposal.payee.name} ${amount}. ${summary}`
            : after.status === "paying"
              ? `I'm paying ${proposal.payee.name} ${amount} now.`
              : `I couldn't pay ${proposal.payee.name} just now. I've told ${familyNames}.`,
      };
    }
  }
}

export class CantReadError extends Error {}

/** Model summaries sometimes lack a full stop; Mum's sentences shouldn't. */
const sentence = (s: string) => (/[.!?”"]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export async function read(
  input: { source: "photo" | "voice" | "text"; text?: string | null; imageDataUrl?: string | null; sampleId?: string | null },
  circle: { careRecipientName: string; currency: string },
  payeeList: Payee[],
): Promise<Extraction> {
  if (aiConfigured()) {
    return extract({
      source: input.source,
      text: input.text,
      imageDataUrl: input.imageDataUrl,
      careRecipientName: circle.careRecipientName,
      knownPayees: payeeList.map((p) => p.name),
      currency: circle.currency,
    });
  }
  // Demo mode: no model. Examples have known readings; text gets the keyword reader.
  if (isSampleId(input.sampleId)) return { ...SAMPLES[input.sampleId], currency: circle.currency };
  if (input.text?.trim()) return heuristicExtract(input.text, payeeList, circle.currency);
  throw new CantReadError("I can read photos once an AI model is connected. Until then, try one of the examples or type what it says.");
}

/**
 * The scam that uses PayPal's own invoices: the email is real, the phone
 * number in the note is the scammer's. Say so plainly, and say what to do.
 */
export function paypalScamMessage(extraction: Extraction, familyNames: string): string | null {
  const p = extraction.paypalNative;
  if (!p?.phoneInNote) return null;
  const what = p.kind === "money_request" ? "money request" : "invoice";
  return `This is a real PayPal ${what}, but the phone number in it (${p.phoneInNote}) isn't PayPal's. That's how this scam works: you call, and they talk you into paying or into giving them your account. You don't owe this. Don't call the number and don't pay it. If you're worried, open the PayPal app yourself. I've let ${familyNames} know.`;
}

/** "Ada and Chioma are awake now; Tunde will see it in the morning." */
export function awakeSentence(family: Member[]): string {
  const { awake, asleep } = whoIsAwake(family);
  if (!asleep.length) return "";
  if (!awake.length) return `It's night for everyone, so they'll see it in the morning.`;
  return `${joinNames(awake.map((m) => m.name))} ${awake.length > 1 ? "are" : "is"} awake now; ${joinNames(asleep.map((m) => m.name))} will see it in the morning.`;
}

/**
 * Run the mandate again for a payment that's waiting — after the family adds
 * or verifies its payee, say. Approvals already given still count.
 */
export async function reevaluateIntent(intentId: string): Promise<PaymentIntent> {
  const db = await getDb();
  const intent = await load(intentId);
  if (intent.status !== "awaiting_approval" && intent.status !== "on_hold") return intent;
  const circle = await getCircle();
  const payee = intent.payeeId ? (await listPayees(circle.id)).find((p) => p.id === intent.payeeId) ?? null : null;
  const [intake] = intent.intakeId ? await db.select().from(intakes).where(eq(intakes.id, intent.intakeId)) : [];
  const scam = intake?.extraction?.scam ?? { impersonation: false, urgency: false, secrecy: false, unusualMethod: false, unsolicited: false, riskScore: 0 };
  const proposal: PaymentProposal = {
    amountMinor: intent.amountMinor,
    currency: intent.currency,
    category: intent.category as PaymentProposal["category"],
    method: intent.method as PaymentProposal["method"],
    payee: {
      id: payee?.id ?? null,
      name: payee?.name ?? intent.payeeName,
      verified: payee?.verified ?? false,
      previouslyPaid: payee ? await payeePreviouslyPaid(payee.id) : false,
    },
    reference: intent.reference,
    scam,
    duplicateOfIntentId: null,
  };
  const evaluation = evaluate(
    proposal,
    await activeMandate(circle.id),
    {
      potBalanceMinor: (await potBalanceMinor(circle.id)) - (await reservedMinor(circle.id)),
      spentThisMonthMinor: await spentThisMonthByCategory(circle.id),
    },
    circle.currency,
  );
  // The family is already looking at it; never auto-pay from here, and never drop below one approval.
  const decision = evaluation.decision === "auto_pay" ? "needs_approval" : evaluation.decision;
  const approvalsRequired = decision === "refuse" ? 0 : Math.max(1, evaluation.approvalsRequired);
  await db
    .update(paymentIntents)
    .set({
      payeeName: proposal.payee.name,
      decision,
      evaluation: { ...evaluation, decision, approvalsRequired },
      approvalsRequired,
      status: STATUS_FOR[decision],
      updatedAt: new Date(),
    })
    .where(eq(paymentIntents.id, intentId));
  await audit(circle.id, "agent", "reevaluated", { evaluation }, intentId);
  return load(intentId);
}
