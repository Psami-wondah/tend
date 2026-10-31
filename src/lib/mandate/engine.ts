import { formatMoney } from "../money";
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
      message: `It asks to be paid by ${humanMethod(proposal.method)}. The family has agreed Tend never pays that way — it's how most scams take money.`,
    });
  }

  if (proposal.scam.riskScore >= mandate.scamRefuseThreshold) {
    reasons.push({
      code: "scam_refuse",
      effect: "refuse",
      message: `This looks like a scam (${scamSummary(proposal)}).`,
    });
  } else if (proposal.scam.riskScore >= mandate.scamReviewThreshold) {
    reasons.push({
      code: "scam_review",
      effect: "needs_approval",
      message: `Some warning signs (${scamSummary(proposal)}), so a family member should check it.`,
    });
    needApproval(mandate.defaultApprovals);
  }

  // --- Payee checks ---------------------------------------------------------
  if (!proposal.payee.id) {
    reasons.push({
      code: "unknown_payee",
      effect: "needs_approval",
      message: `“${proposal.payee.name}” isn't one of the circle's payees yet. Someone needs to confirm who they are.`,
    });
    needApproval(mandate.defaultApprovals);
  } else {
    if (!proposal.payee.verified) {
      reasons.push({
        code: "unverified_payee",
        effect: "needs_approval",
        message: `${proposal.payee.name}'s PayPal details haven't been confirmed by the family.`,
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
      message: `Over ${money(mandate.largePaymentOverMinor)}, so ${mandate.largePaymentApprovals} family members need to approve.`,
    });
    needApproval(mandate.largePaymentApprovals);
  } else if (proposal.amountMinor > rule.autoPayUpToMinor) {
    reasons.push({
      code: "over_auto_limit",
      effect: "needs_approval",
      message:
        rule.autoPayUpToMinor === 0
          ? `${capitalise(proposal.category)} payments always need a family member's OK.`
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
      message: `The pot has ${money(state.potBalanceMinor)}; this needs ${money(proposal.amountMinor)}. I'll ask the family to top up.`,
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
  refuse: 3,
  hold: 2,
  needs_approval: 1,
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

function scamSummary(p: PaymentProposal): string {
  const s = p.scam;
  const parts: string[] = [];
  if (s.impersonation) parts.push("someone claiming to be family or an official");
  if (s.urgency) parts.push("pressure to pay right now");
  if (s.secrecy) parts.push("asks to keep it secret");
  if (s.unusualMethod) parts.push(`wants ${humanMethod(p.method)}`);
  if (s.unsolicited) parts.push("a request she didn't start");
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
