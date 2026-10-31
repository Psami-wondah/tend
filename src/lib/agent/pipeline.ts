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
import { executeIntent } from "./executor";
import type { Extraction } from "./schemas";
import type { IntentStatus, PaymentIntent } from "../db/schema";

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

  const extraction = input.preExtracted ?? await extract({
    source: input.source,
    text: input.text,
    imageDataUrl: input.imageDataUrl,
    careRecipientName: circle.careRecipientName,
    knownPayees: payeeList.map((p) => p.name),
    currency: circle.currency,
  });
  await db.update(intakes).set({ extraction }).where(eq(intakes.id, intake.id));
  await audit(circle.id, "agent", "intake_read", { intakeId: intake.id, extraction });

  const family = (await getMembers(circle.id)).filter((m) => m.role === "owner" || m.role === "sibling");
  const familyNames = joinNames(family.map((m) => m.name));

  // Not a bill — but it might still be a scam worth warning about.
  if (!extraction.isPaymentRequest || extraction.amount === null) {
    if (extraction.scam.riskScore >= (await activeMandate(circle.id)).scamReviewThreshold) {
      await alert(circle.id, "danger", "Possible scam sent to " + circle.careRecipientName, extraction.scam.explanation);
      return {
        outcome: "warning",
        extraction,
        message: `Please be careful with this one. ${extraction.scam.explanation} I've let ${familyNames} know.`,
      };
    }
    return {
      outcome: "nothing_to_pay",
      extraction,
      message: `I read it: ${extraction.summary} There's nothing to pay.`,
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
  await audit(circle.id, "agent", "decided", { proposal, evaluation }, created.id);

  const amount = formatMoney(amountMinor, circle.currency);
  const headline = evaluation.reasons[0]?.message ?? "";

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
        message: `I haven't paid this. ${headline} Please don't send them anything. I've let ${familyNames} know.`,
      };
    }
    case "hold": {
      await alert(circle.id, "action", "Pot needs a top-up", `${proposal.payee.name} needs ${amount}. ${headline}`, created.id);
      return {
        outcome: "on_hold",
        extraction,
        evaluation,
        intent: created,
        message: `There isn't quite enough in the care pot for this yet. I've asked ${familyNames} to top it up, and I'll pay as soon as they do.`,
      };
    }
    case "needs_approval": {
      const n = evaluation.approvalsRequired;
      await alert(
        circle.id,
        "action",
        `Approve ${amount} to ${proposal.payee.name}?`,
        `${extraction.summary} ${n > 1 ? `Needs ${n} approvals.` : "Needs 1 approval."} ${headline}`,
        created.id,
      );
      return {
        outcome: "awaiting_approval",
        extraction,
        evaluation,
        intent: created,
        message: `Got it — ${extraction.summary} I've asked ${familyNames} to OK it, and I'll pay as soon as they do.`,
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
            ? `Done. I've paid ${proposal.payee.name} ${amount}. ${extraction.summary}`
            : after.status === "paying"
              ? `I'm paying ${proposal.payee.name} ${amount} now.`
              : `I couldn't pay ${proposal.payee.name} just now. I've told ${familyNames}.`,
      };
    }
  }
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "the family";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
