import type { Mandate } from "./types";

/** A sensible starting mandate. Families edit this in Settings. */
export const DEFAULT_MANDATE: Mandate = {
  version: 1,
  categories: {
    pharmacy: { autoPayUpToMinor: 6_000, monthlyBudgetMinor: 30_000 },
    carer: { autoPayUpToMinor: 0, monthlyBudgetMinor: 200_000 },
    clinic: { autoPayUpToMinor: 5_000 },
    equipment: { autoPayUpToMinor: 0 },
    transport: { autoPayUpToMinor: 4_000, monthlyBudgetMinor: 20_000 },
    groceries: { autoPayUpToMinor: 8_000, monthlyBudgetMinor: 60_000 },
    utilities: { autoPayUpToMinor: 15_000 },
    other: { autoPayUpToMinor: 0 },
  },
  largePaymentOverMinor: 20_000,
  largePaymentApprovals: 2,
  defaultApprovals: 1,
  newPayeeRequiresApproval: true,
  blockedMethods: ["gift_card", "crypto", "wire", "cash_courier"],
  scamRefuseThreshold: 0.75,
  scamReviewThreshold: 0.4,
};
