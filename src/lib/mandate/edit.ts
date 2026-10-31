import { z } from "zod";
import { CATEGORIES, PAYMENT_METHODS, type Category, type Mandate, type OwnPaymentRules, type PaymentMethod } from "./types";
import { DEFAULT_OWN_PAYMENTS } from "./defaults";
import { formatMoney } from "../money";
import { humanMethod } from "./engine";

/**
 * Everything the family can change about the mandate, as flat named paths.
 * The rules page edits these, the plain-English editor proposes changes to
 * them, and the diff shown before saving is computed over them. Pure: no I/O.
 */

export type RuleKind = "money" | "optionalMoney" | "count" | "toggle" | "blocked" | "threshold" | "hours";

export interface RuleField {
  path: string;
  label: string;
  kind: RuleKind;
  /** For the plain-English editor: what the number means. */
  unit: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  pharmacy: "Pharmacy",
  carer: "Carer",
  clinic: "Clinic",
  equipment: "Equipment",
  transport: "Transport",
  groceries: "Groceries",
  utilities: "Utilities",
  other: "Other",
};

export const categoryLabel = (c: string) => CATEGORY_LABEL[c as Category] ?? c;

export const EDITABLE_METHODS = PAYMENT_METHODS.filter((m) => m !== "paypal" && m !== "unknown");

export const RULE_FIELDS: RuleField[] = [
  ...CATEGORIES.flatMap((c): RuleField[] => [
    { path: `categories.${c}.autoPayUpToMinor`, label: `${CATEGORY_LABEL[c]} auto-pay limit`, kind: "money", unit: "dollars; 0 means always ask" },
    { path: `categories.${c}.monthlyBudgetMinor`, label: `${CATEGORY_LABEL[c]} monthly budget`, kind: "optionalMoney", unit: "dollars; null means no budget" },
  ]),
  { path: "largePaymentOverMinor", label: "Large payment threshold", kind: "money", unit: "dollars" },
  { path: "largePaymentApprovals", label: "Approvals for large payments", kind: "count", unit: "people" },
  { path: "defaultApprovals", label: "Approvals for everything else", kind: "count", unit: "people" },
  { path: "newPayeeRequiresApproval", label: "Ask before paying someone new", kind: "toggle", unit: "true or false" },
  ...EDITABLE_METHODS.map((m): RuleField => ({ path: `blockedMethods.${m}`, label: `Never pay by ${humanMethod(m)}`, kind: "blocked", unit: "true blocks it, false allows it" })),
  { path: "scamReviewThreshold", label: "Ask the circle when scam risk is at least", kind: "threshold", unit: "0 to 1" },
  { path: "scamRefuseThreshold", label: "Refuse outright when scam risk is at least", kind: "threshold", unit: "0 to 1" },
  { path: "ownPayments.coolingOffHours", label: "Hold unusual payments from their own PayPal for", kind: "hours", unit: "hours, 1 to 71" },
  { path: "ownPayments.coolOffOverMinor", label: "Hold their own payments over", kind: "money", unit: "dollars" },
  { path: "ownPayments.approvalOverMinor", label: "Their own payments need a yes over", kind: "money", unit: "dollars" },
  { path: "ownPayments.holdNewPayees", label: "Hold their first payment to anyone new", kind: "toggle", unit: "true or false" },
];

export const RULE_PATHS = RULE_FIELDS.map((f) => f.path) as [string, ...string[]];
const FIELD = new Map(RULE_FIELDS.map((f) => [f.path, f]));

export type RuleValue = number | boolean | null;

export function readRule(m: Mandate, path: string): RuleValue {
  const [head, a, b] = path.split(".");
  if (head === "categories") {
    const rule = m.categories[a as Category];
    const v = rule?.[b as "autoPayUpToMinor" | "monthlyBudgetMinor"];
    return v ?? null;
  }
  if (head === "blockedMethods") return m.blockedMethods.includes(a as PaymentMethod);
  if (head === "ownPayments") return (m.ownPayments ?? DEFAULT_OWN_PAYMENTS)[a as keyof OwnPaymentRules] ?? null;
  return (m as unknown as Record<string, RuleValue>)[head] ?? null;
}

/** Returns a new mandate with the change applied. Throws on an invalid value. */
export function writeRule(m: Mandate, path: string, value: RuleValue): Mandate {
  const field = FIELD.get(path);
  if (!field) throw new Error(`Unknown rule ${path}`);
  const v = checkValue(field, value);
  const next: Mandate = structuredClone(m);
  const [head, a, b] = path.split(".");
  if (head === "categories") {
    const rule = { ...next.categories[a as Category] };
    if (b === "monthlyBudgetMinor") {
      if (v === null) delete rule.monthlyBudgetMinor;
      else rule.monthlyBudgetMinor = v as number;
    } else rule.autoPayUpToMinor = v as number;
    next.categories[a as Category] = rule;
  } else if (head === "ownPayments") {
    next.ownPayments = { ...(next.ownPayments ?? DEFAULT_OWN_PAYMENTS), [a]: v } as OwnPaymentRules;
  } else if (head === "blockedMethods") {
    const set = new Set(next.blockedMethods);
    if (v) set.add(a as PaymentMethod);
    else set.delete(a as PaymentMethod);
    next.blockedMethods = PAYMENT_METHODS.filter((x) => set.has(x));
  } else {
    (next as unknown as Record<string, RuleValue>)[head] = v;
  }
  return next;
}

function checkValue(field: RuleField, value: RuleValue): RuleValue {
  switch (field.kind) {
    case "money":
    case "optionalMoney":
      if (value === null && field.kind === "optionalMoney") return null;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10_000_000) {
        throw new Error(`${field.label} must be an amount between $0 and $100,000`);
      }
      return Math.round(value);
    case "count":
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
        throw new Error(`${field.label} must be between 1 and 5 people`);
      }
      return value;
    case "toggle":
    case "blocked":
      if (typeof value !== "boolean") throw new Error(`${field.label} must be on or off`);
      return value;
    case "threshold":
      if (typeof value !== "number" || value < 0.05 || value > 1) throw new Error(`${field.label} must be between 0.05 and 1`);
      return Math.round(value * 100) / 100;
    case "hours":
      // PayPal's honor period for capturing an authorization is three days.
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 71) throw new Error(`${field.label} must be between 1 and 71 hours`);
      return value;
  }
}

export interface RuleChange {
  path: string;
  label: string;
  before: RuleValue;
  after: RuleValue;
  /** "$60.00 → $80.00" */
  display: string;
  /** True when the change lets Tend pay more without asking. */
  loosens: boolean;
}

export function diffMandates(before: Mandate, after: Mandate, currency = "USD"): RuleChange[] {
  const out: RuleChange[] = [];
  for (const f of RULE_FIELDS) {
    const a = readRule(before, f.path);
    const b = readRule(after, f.path);
    if (a === b) continue;
    out.push({ path: f.path, label: f.label, before: a, after: b, display: `${show(f, a, currency)} → ${show(f, b, currency)}`, loosens: loosens(f, a, b) });
  }
  return out;
}

export function show(f: RuleField | string, v: RuleValue, currency = "USD"): string {
  const field = typeof f === "string" ? FIELD.get(f) : f;
  if (!field) return String(v);
  switch (field.kind) {
    case "money":
      return v === 0 ? "always ask" : formatMoney(Number(v), currency);
    case "optionalMoney":
      return v === null ? "no budget" : formatMoney(Number(v), currency);
    case "count":
      return `${v} ${v === 1 ? "person" : "people"}`;
    case "toggle":
      return v ? "on" : "off";
    case "blocked":
      return v ? "blocked" : "allowed";
    case "threshold":
      return `${Math.round(Number(v) * 100)}%`;
    case "hours":
      return `${v} hours`;
  }
}

function loosens(f: RuleField, a: RuleValue, b: RuleValue): boolean {
  switch (f.kind) {
    case "money":
      return f.path === "largePaymentOverMinor" || f.path.endsWith("autoPayUpToMinor") || f.path.startsWith("ownPayments.") ? Number(b) > Number(a) : false;
    case "optionalMoney":
      return b === null || (a !== null && Number(b) > Number(a));
    case "count":
      return Number(b) < Number(a);
    case "toggle":
    case "blocked":
      return a === true && b === false;
    case "threshold":
      return Number(b) > Number(a);
    case "hours":
      return Number(b) < Number(a);
  }
}

/** Sanity rules that keep a mandate coherent whoever edited it. */
export function validateMandate(m: Mandate): string[] {
  const problems: string[] = [];
  if (m.scamRefuseThreshold < m.scamReviewThreshold) problems.push("The refuse threshold must be at least the ask-the-circle threshold.");
  const own = m.ownPayments ?? DEFAULT_OWN_PAYMENTS;
  if (own.approvalOverMinor < own.coolOffOverMinor) problems.push("Their own payments should need a yes only above the amount where Tend starts holding them.");
  if (!m.blockedMethods.includes("gift_card")) problems.push("Gift cards stay blocked: they are the most common way scammers take money from older people.");
  for (const c of CATEGORIES) {
    const r = m.categories[c];
    if (r.autoPayUpToMinor > m.largePaymentOverMinor) {
      problems.push(`${CATEGORY_LABEL[c]} auto-pay can't be above the large-payment threshold (${formatMoney(m.largePaymentOverMinor)}).`);
    }
  }
  return problems;
}

/** What the model returns when asked to turn a sentence into rule changes. */
export const RuleProposalSchema = z.object({
  understood: z.boolean().describe("False if the request isn't about the spending rules or is too vague to act on."),
  changes: z
    .array(
      z.object({
        path: z.enum(RULE_PATHS),
        value: z.union([z.number(), z.boolean(), z.null()]).describe("In the unit listed for the rule. Money in dollars, e.g. 80 for $80."),
      }),
    )
    .describe("Only the rules the person asked to change."),
  reply: z.string().describe("One short sentence back to the person in the circle about what you understood, or why you can't."),
});
export type RuleProposal = z.infer<typeof RuleProposalSchema>;

/** Turns a model proposal (money in major units) into a validated mandate + diff. */
export function applyProposal(m: Mandate, proposal: RuleProposal, currency = "USD") {
  let next = m;
  const rejected: string[] = [];
  for (const c of proposal.changes) {
    const field = FIELD.get(c.path);
    if (!field) continue;
    const value = (field.kind === "money" || field.kind === "optionalMoney") && typeof c.value === "number" ? Math.round(c.value * 100) : c.value;
    try {
      next = writeRule(next, c.path, value);
    } catch (e) {
      rejected.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { mandate: next, changes: diffMandates(m, next, currency), rejected, problems: validateMandate(next) };
}

/** The rule list as the model sees it: path, meaning, unit, current value. */
export function describeRulesForModel(m: Mandate): string {
  return RULE_FIELDS.map((f) => {
    const v = readRule(m, f.path);
    const shown = (f.kind === "money" || f.kind === "optionalMoney") && typeof v === "number" ? v / 100 : v;
    return `${f.path} | ${f.label} | ${f.unit} | current: ${shown}`;
  }).join("\n");
}
