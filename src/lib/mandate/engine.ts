import { formatMoney } from "../money";
import { DEFAULT_OWN_PAYMENTS } from "./defaults";
import type {
  CircleState,
  Decision,
  Mandate,
  MandateResult,
  PaymentProposal,
  Reason,
} from "./types";

/**
 * Decide what Tend may do with a proposed payment.
 *
 * This function is deliberately pure and deterministic: no I/O, no model calls.
 * The language model *proposes* (reads the bill, spots scam patterns); this
 * function *decides*. That separation is the safety story — an LLM can be
 * talked into things, a rule table can't.
 *
 * Precedence: refuse > hold > needs_approval > auto_pay.
 */
export function evaluate(
  proposal: PaymentProposal,
  mandate: Mandate,
  state: CircleState,
  circleCurrency: string,
): MandateResult {
  const reasons: Reason[] = [];
  const money = (m: number) => formatMoney(m, circleCurrency);
  let approvals = 0;
  const needApproval = (n: number) => {
    approvals = Math.max(approvals, n);
  };

  // --- Hard refusals --------------------------------------------------------
  if (!Number.isFinite(proposal.amountMinor) || proposal.amountMinor <= 0) {
    reasons.push({
      code: "invalid_amount",
      effect: "refuse",
      message: "I couldn't find a valid amount to pay.",
    });
  }

  if (proposal.currency.toUpperCase() !== circleCurrency.toUpperCase()) {
    reasons.push({
      code: "currency_mismatch",
      effect: "refuse",
      message: `This asks for ${proposal.currency}, but the care pot holds ${circleCurrency}.`,
    });
  }

  if (mandate.blockedMethods.includes(proposal.method)) {
    reasons.push({
      code: "blocked_method",
      effect: "refuse",
      message: `It asks to be paid by ${humanMethod(proposal.method)}. The circle has agreed Tend never pays that way — it's how most scams take money.`,
    });
  }

  if (proposal.paypalPhoneInNote) {
    reasons.push(paypalInvoiceReason(proposal.paypalPhoneInNote));
  } else if (proposal.scam.riskScore >= mandate.scamRefuseThreshold) {
    reasons.push({
      code: "scam_refuse",
      effect: "refuse",
      message: `This looks like a scam (${scamSummary(proposal)}).`,
    });
  } else if (proposal.scam.riskScore >= mandate.scamReviewThreshold) {
    reasons.push({
      code: "scam_review",
      effect: "needs_approval",
      message: `Some warning signs (${scamSummary(proposal)}), so someone in the circle should check it.`,
    });
    needApproval(mandate.defaultApprovals);
  }

  // --- Payee checks ---------------------------------------------------------
  if (!proposal.payee.id) {
    reasons.push({
      code: "unknown_payee",
      effect: "needs_approval",
      message: `“${proposal.payee.name}” isn't one of the circle's payees yet. Someone in the circle needs to confirm who they are.`,
    });
    needApproval(mandate.defaultApprovals);
  } else {
    if (!proposal.payee.verified) {
      reasons.push({
        code: "unverified_payee",
        effect: "needs_approval",
        message: `${proposal.payee.name}'s PayPal details haven't been confirmed by the circle.`,
      });
      needApproval(mandate.defaultApprovals);
    }
    if (mandate.newPayeeRequiresApproval && !proposal.payee.previouslyPaid) {
      reasons.push({
        code: "new_payee",
        effect: "needs_approval",
        message: `First payment to ${proposal.payee.name}.`,
      });
      needApproval(mandate.defaultApprovals);
    }
  }

  if (proposal.duplicateOfIntentId) {
    reasons.push({
      code: "duplicate",
      effect: "needs_approval",
      message: "This looks like a bill that was already paid recently.",
    });
    needApproval(mandate.defaultApprovals);
  }

  // --- Amount checks --------------------------------------------------------
  const rule = mandate.categories[proposal.category] ?? mandate.categories.other;

  if (proposal.amountMinor > mandate.largePaymentOverMinor) {
    reasons.push({
      code: "large_payment",
      effect: "needs_approval",
      message: `Over ${money(mandate.largePaymentOverMinor)}, so ${mandate.largePaymentApprovals} people in the circle need to approve.`,
    });
    needApproval(mandate.largePaymentApprovals);
  } else if (proposal.amountMinor > rule.autoPayUpToMinor) {
    reasons.push({
      code: "over_auto_limit",
      effect: "needs_approval",
      message:
        rule.autoPayUpToMinor === 0
          ? `${capitalise(proposal.category)} payments always need an OK from the circle.`
          : `Over the ${money(rule.autoPayUpToMinor)} auto-pay limit for ${proposal.category}.`,
    });
    needApproval(mandate.defaultApprovals);
  } else {
    reasons.push({
      code: "within_auto_limit",
      effect: "auto_pay",
      message: `Within the ${money(rule.autoPayUpToMinor)} limit the family set for ${proposal.category}.`,
    });
  }

  if (rule.monthlyBudgetMinor !== undefined) {
    const spent = state.spentThisMonthMinor[proposal.category] ?? 0;
    if (spent + proposal.amountMinor > rule.monthlyBudgetMinor) {
      reasons.push({
        code: "over_monthly_budget",
        effect: "needs_approval",
        message: `This would take ${proposal.category} spending to ${money(spent + proposal.amountMinor)} this month (budget ${money(rule.monthlyBudgetMinor)}).`,
      });
      needApproval(mandate.defaultApprovals);
    }
  }

  // --- Funds ----------------------------------------------------------------
  if (proposal.amountMinor > state.potBalanceMinor) {
    reasons.push({
      code: "insufficient_funds",
      effect: "hold",
      message: `The pot has ${money(state.potBalanceMinor)}; this needs ${money(proposal.amountMinor)}. I'll ask the circle to top up.`,
    });
  }

  const decision = resolve(reasons);
  return {
    decision,
    approvalsRequired: decision === "refuse" ? 0 : approvals,
    reasons: sortReasons(reasons),
    mandateVersion: mandate.version,
  };
}

const RANK: Record<Decision, number> = {
  refuse: 4,
  hold: 3,
  needs_approval: 2,
  cool_off: 1,
  auto_pay: 0,
};

function resolve(reasons: Reason[]): Decision {
  return reasons.reduce<Decision>(
    (worst, r) => (RANK[r.effect] > RANK[worst] ? r.effect : worst),
    "auto_pay",
  );
}

function sortReasons(reasons: Reason[]): Reason[] {
  return [...reasons].sort((a, b) => RANK[b.effect] - RANK[a.effect]);
}

/** The scam that runs on PayPal's own invoices: the email is genuine, the phone number in the note isn't PayPal's. */
function paypalInvoiceReason(phone: string): Reason {
  return {
    code: "paypal_invoice_scam",
    effect: "refuse",
    message: `A real PayPal invoice with a phone number to call (${phone}). PayPal never puts a support number in an invoice note; the scammer answers it.`,
  };
}

function scamSummary(p: PaymentProposal): string {
  const s = p.scam;
  const parts: string[] = [];
  if (s.impersonation) parts.push("someone claiming to be family or an official");
  if (s.urgency) parts.push("pressure to pay right now");
  if (s.secrecy) parts.push("asks to keep it secret");
  if (s.unusualMethod) parts.push(`wants ${humanMethod(p.method)}`);
  if (s.unsolicited) parts.push("a request out of the blue");
  return parts.length ? parts.join(", ") : "unusual request";
}

export function humanMethod(m: PaymentProposal["method"]): string {
  switch (m) {
    case "gift_card":
      return "gift cards";
    case "crypto":
      return "cryptocurrency";
    case "wire":
      return "wire transfer";
    case "cash_courier":
      return "cash collected by a courier";
    case "bank_transfer":
      return "bank transfer";
    case "paypal":
      return "PayPal";
    default:
      return "an unknown method";
  }
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The person pays from their own PayPal. Same idea, different power: Tend
 * refuses only what the circle has agreed is never safe (blocked methods,
 * clear scams). Everything else is theirs to pay. What Tend adds is time:
 * an unusual payment is authorized but held for a cooling-off period, so
 * someone they trust can look, and stop it if it's a scam.
 *
 * Precedence: refuse > needs_approval > cool_off > auto_pay.
 */
export function evaluateOwnPayment(
  proposal: PaymentProposal,
  mandate: Mandate,
  circleCurrency: string,
  payerName: string,
): MandateResult & { holdHours: number } {
  const rules = mandate.ownPayments ?? DEFAULT_OWN_PAYMENTS;
  const reasons: Reason[] = [];
  const money = (m: number) => formatMoney(m, circleCurrency);
  const hours = rules.coolingOffHours;
  const holdText = hours >= 24 && hours % 24 === 0 ? `${hours / 24 === 1 ? "a day" : `${hours / 24} days`}` : `${hours} hours`;

  if (!Number.isFinite(proposal.amountMinor) || proposal.amountMinor <= 0) {
    reasons.push({ code: "invalid_amount", effect: "refuse", message: "I couldn't find a valid amount to pay." });
  }
  if (proposal.currency.toUpperCase() !== circleCurrency.toUpperCase()) {
    reasons.push({ code: "currency_mismatch", effect: "refuse", message: `This asks for ${proposal.currency}; ${payerName}'s payments here are in ${circleCurrency}.` });
  }
  if (mandate.blockedMethods.includes(proposal.method)) {
    reasons.push({
      code: "blocked_method",
      effect: "refuse",
      message: `It asks to be paid by ${humanMethod(proposal.method)}. Real businesses don't ask for that; scammers do.`,
    });
  }
  if (proposal.paypalPhoneInNote) {
    reasons.push(paypalInvoiceReason(proposal.paypalPhoneInNote));
  } else if (proposal.scam.riskScore >= mandate.scamRefuseThreshold) {
    reasons.push({ code: "scam_refuse", effect: "refuse", message: `This looks like a scam (${scamSummary(proposal)}).` });
  } else if (proposal.scam.riskScore >= mandate.scamReviewThreshold) {
    reasons.push({ code: "scam_review", effect: "needs_approval", message: `Some warning signs (${scamSummary(proposal)}), so someone in the circle should look first.` });
  }

  if (proposal.amountMinor > rules.approvalOverMinor) {
    reasons.push({ code: "own_large", effect: "needs_approval", message: `Over ${money(rules.approvalOverMinor)}, so one person in the circle says yes before it goes.` });
  }
  const isNew = !proposal.payee.id || !proposal.payee.previouslyPaid;
  const known = proposal.payee.name && proposal.payee.name !== "Unknown sender" && proposal.payee.name !== "someone new";
  // How long is said once, in the plan sentence; a needs-a-yes payment waits longer than the cooling-off.
  if (rules.holdNewPayees && isNew) {
    reasons.push({ code: "cooling_off", effect: "cool_off", message: `${known ? `First payment to ${proposal.payee.name}` : "A payment to someone new"}, so the circle gets a look before any money leaves.` });
  } else if (proposal.amountMinor > rules.coolOffOverMinor) {
    reasons.push({ code: "cooling_off", effect: "cool_off", message: `Over ${money(rules.coolOffOverMinor)}, so I hold it for ${holdText} first, just in case.` });
  }
  if (proposal.duplicateOfIntentId) {
    reasons.push({ code: "duplicate", effect: "cool_off", message: "This looks like something already paid recently, so I'll hold it while someone checks." });
  }
  if (!reasons.length) {
    reasons.push({ code: "own_routine", effect: "auto_pay", message: `${proposal.payee.name} has been paid before and this is an ordinary amount, so it goes straight through.` });
  }

  const decision = resolve(reasons);
  return {
    decision,
    approvalsRequired: decision === "needs_approval" ? 1 : 0,
    reasons: sortReasons(reasons),
    mandateVersion: mandate.version,
    holdHours: decision === "cool_off" ? hours : decision === "needs_approval" ? 72 : 0,
  };
}
