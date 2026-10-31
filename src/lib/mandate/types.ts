/**
 * The mandate is the family's agreement about what Tend may pay without asking.
 * It is plain data so the family can read it, edit it, and so it can be versioned.
 */

export const CATEGORIES = [
  "pharmacy",
  "carer",
  "clinic",
  "equipment",
  "transport",
  "groceries",
  "utilities",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PAYMENT_METHODS = [
  "paypal", // normal PayPal payout to a verified payee
  "bank_transfer",
  "gift_card",
  "crypto",
  "wire",
  "cash_courier",
  "unknown",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface CategoryRule {
  /** Pay automatically when the amount is at or below this (minor units). 0 = never auto-pay. */
  autoPayUpToMinor: number;
  /** Optional monthly budget for the category (minor units). Exceeding it needs approval. */
  monthlyBudgetMinor?: number;
}

export interface Mandate {
  version: number;
  categories: Record<Category, CategoryRule>;
  /** Any single payment above this needs `largePaymentApprovals` approvals. */
  largePaymentOverMinor: number;
  largePaymentApprovals: number;
  /** Approvals needed for anything that isn't auto-paid and isn't "large". */
  defaultApprovals: number;
  /** First payment to a payee we've never paid always needs approval. */
  newPayeeRequiresApproval: boolean;
  /** Methods Tend will never use, whoever asks. */
  blockedMethods: PaymentMethod[];
  /** Minimum scam-risk score (0–1) at which Tend refuses outright. */
  scamRefuseThreshold: number;
  /** Minimum scam-risk score at which Tend asks the family instead of paying. */
  scamReviewThreshold: number;
}

export interface ScamSignals {
  impersonation: boolean; // "it's your grandson", "this is the bank"
  urgency: boolean; // "right now", "today or else"
  secrecy: boolean; // "don't tell anyone"
  unusualMethod: boolean; // gift cards, crypto, wire, courier
  unsolicited: boolean; // payment request she didn't initiate
  /** Model's overall risk estimate, 0–1. */
  riskScore: number;
}

/** What the agent proposes. Produced by AI extraction + payee matching. */
export interface PaymentProposal {
  amountMinor: number;
  currency: string;
  category: Category;
  method: PaymentMethod;
  payee: {
    id: string | null; // null = not a payee the circle knows
    name: string;
    verified: boolean; // family has confirmed this payee's PayPal identity
    previouslyPaid: boolean;
  };
  reference?: string | null;
  scam: ScamSignals;
  /** Set when the same payee/amount/reference was paid recently. */
  duplicateOfIntentId?: string | null;
}

/** Facts about the circle at decision time. */
export interface CircleState {
  potBalanceMinor: number;
  spentThisMonthMinor: Partial<Record<Category, number>>;
}

export type Decision = "auto_pay" | "needs_approval" | "hold" | "refuse";

export type ReasonCode =
  | "within_auto_limit"
  | "over_auto_limit"
  | "large_payment"
  | "new_payee"
  | "unverified_payee"
  | "unknown_payee"
  | "over_monthly_budget"
  | "blocked_method"
  | "scam_refuse"
  | "scam_review"
  | "duplicate"
  | "insufficient_funds"
  | "invalid_amount"
  | "currency_mismatch";

export interface Reason {
  code: ReasonCode;
  message: string;
  /** Which way this reason pushes the decision. */
  effect: Decision;
}

export interface MandateResult {
  decision: Decision;
  approvalsRequired: number;
  reasons: Reason[];
  mandateVersion: number;
}
