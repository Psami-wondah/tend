import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Decision, MandateResult, Mandate } from "../mandate/types";
import type { Extraction } from "../agent/schemas";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** A family looking after one person. */
export const circles = pgTable("circles", {
  id: id(),
  name: text("name").notNull(),
  careRecipientName: text("care_recipient_name").notNull(),
  currency: text("currency").notNull().default("USD"),
  /** A shared pot the circle pays into. People ageing alone may have no pot, only protection. */
  potEnabled: boolean("pot_enabled").notNull().default(true),
  /** One line about who this circle looks after, for the welcome screen. */
  story: text("story"),
  createdAt: createdAt(),
});

export const members = pgTable("members", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  name: text("name").notNull(),
  /** PayPal (sandbox) email — used for invoices and payouts. */
  email: text("email").notNull(),
  /** owner and sibling are both trusted members of the circle; sibling is any non-owner member. */
  role: text("role", { enum: ["owner", "sibling", "care_recipient", "carer"] }).notNull(),
  /** How they're related to the person at the centre: son, niece, neighbour, friend, money manager… */
  relation: text("relation"),
  /** Where they live. The family is spread across time zones, so Tend shows everyone's clock. */
  city: text("city"),
  /** IANA time zone, e.g. "Europe/London". */
  timezone: text("timezone"),
  /** One colour per person, used everywhere they appear (dial bezel, dots, contribution bars). */
  color: text("color"),
  /** The currency they earn in; PayPal converts at checkout. */
  homeCurrency: text("home_currency"),
  /** PayPal Vault (Payment Method Tokens v3): the person's saved wallet, for repeat bills they consented to. */
  vaultTokenId: text("vault_token_id"),
  vaultCustomerId: text("vault_customer_id"),
  vaultConsent: jsonb("vault_consent").$type<{ maxPerPaymentMinor: number; payeeIds: string[]; grantedAt: string }>(),
  createdAt: createdAt(),
});

/** People and businesses Tend may pay: pharmacies, carers, clinics. */
export const payees = pgTable("payees", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  name: text("name").notNull(),
  /** Other names the AI might see on a bill ("Riverside Rx", "Riverside Pharmacy Ltd"). */
  aliases: jsonb("aliases").$type<string[]>().notNull().default([]),
  kind: text("kind").notNull(),
  paypalEmail: text("paypal_email").notNull(),
  verified: boolean("verified").notNull().default(false),
  /** Code sent in a one-cent PayPal payout; the family confirms it arrived. */
  verificationCode: text("verification_code"),
  verificationSentAt: timestamp("verification_sent_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by"),
  addedBy: text("added_by"),
  createdAt: createdAt(),
});

export const mandates = pgTable("mandates", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  version: integer("version").notNull(),
  rules: jsonb("rules").$type<Mandate>().notNull(),
  createdBy: text("created_by"),
  createdAt: createdAt(),
});

/** Something Mum (or a carer) sent in: a photo, a voice note, a forwarded text. */
export const intakes = pgTable("intakes", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  submittedBy: text("submitted_by").references(() => members.id),
  source: text("source", { enum: ["photo", "voice", "text"] }).notNull(),
  text: text("text"),
  imageDataUrl: text("image_data_url"),
  extraction: jsonb("extraction").$type<Extraction>(),
  createdAt: createdAt(),
});

export type IntentStatus =
  | "awaiting_approval"
  | "on_hold"
  | "refused"
  | "rejected"
  | "approved"
  | "paying"
  | "paid"
  | "failed"
  // Own-wallet payments (the person pays from their own PayPal):
  | "awaiting_payer" // order created, waiting for them to approve in PayPal
  | "held" // authorized: the money is held in their account, the circle can stop it
  | "voided"; // stopped: the authorization was voided, nothing left their account

/** Where the money comes from: the circle's shared pot, or the person's own PayPal. */
export type Funding = "pot" | "own";

/** A payment Tend has been asked to make, and everything that happened to it. */
export const paymentIntents = pgTable("payment_intents", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  intakeId: text("intake_id").references(() => intakes.id),
  payeeId: text("payee_id").references(() => payees.id),
  payeeName: text("payee_name").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  category: text("category").notNull(),
  method: text("method").notNull(),
  reference: text("reference"),
  summary: text("summary").notNull(),
  decision: text("decision").$type<Decision>().notNull(),
  evaluation: jsonb("evaluation").$type<MandateResult>().notNull(),
  approvalsRequired: integer("approvals_required").notNull().default(0),
  status: text("status").$type<IntentStatus>().notNull(),
  paypalBatchId: text("paypal_batch_id"),
  paypalItemId: text("paypal_item_id"),
  paypalTransactionId: text("paypal_transaction_id"),
  failureReason: text("failure_reason"),
  funding: text("funding").$type<Funding>().notNull().default("pot"),
  /** Own-wallet payments: the person who is paying. */
  payerId: text("payer_id"),
  /** Where the money goes when released (a known payee's or the one on the bill). */
  payeeEmail: text("payee_email"),
  paypalOrderId: text("paypal_order_id"),
  paypalAuthorizationId: text("paypal_authorization_id"),
  paypalCaptureId: text("paypal_capture_id"),
  /** Cooling-off: the hold ends (and Tend releases the money) at this time unless someone stops it. */
  holdUntil: timestamp("hold_until", { withTimezone: true }),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  stoppedBy: text("stopped_by"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    intentId: text("intent_id").notNull().references(() => paymentIntents.id),
    memberId: text("member_id").notNull().references(() => members.id),
    verdict: text("verdict", { enum: ["approve", "reject"] }).notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("approvals_intent_member").on(t.intentId, t.memberId)],
);

/** Money a family member put into the pot via PayPal Checkout or a paid invoice. */
export const contributions = pgTable("contributions", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  memberId: text("member_id").notNull().references(() => members.id),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  source: text("source", { enum: ["checkout", "invoice"] }).notNull(),
  paypalOrderId: text("paypal_order_id"),
  paypalInvoiceId: text("paypal_invoice_id"),
  status: text("status", { enum: ["pending", "completed", "failed"] }).notNull(),
  createdAt: createdAt(),
});

/** Append-only. The pot balance is the sum of amount_minor. */
export const ledgerEntries = pgTable("ledger_entries", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  type: text("type", { enum: ["contribution", "payment", "refund", "verification"] }).notNull(),
  amountMinor: integer("amount_minor").notNull(),
  memberId: text("member_id").references(() => members.id),
  intentId: text("intent_id").references(() => paymentIntents.id),
  contributionId: text("contribution_id").references(() => contributions.id),
  description: text("description").notNull(),
  createdAt: createdAt(),
});

/** Every decision the agent makes, with its reasons. This is what judges should see. */
export const auditEvents = pgTable("audit_events", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  intentId: text("intent_id"),
  actor: text("actor").notNull(), // "agent" | "paypal" | "member:<id>"
  type: text("type").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const alerts = pgTable("alerts", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  intentId: text("intent_id"),
  severity: text("severity", { enum: ["info", "action", "danger"] }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * A payment Tend thinks was made twice. The family can ask the payee for the
 * money back, which sends the payee a PayPal invoice.
 */
export type RecoveryStatus = "found" | "requested" | "recovered" | "dismissed";

export const recoveries = pgTable("recoveries", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  /** The later of the two payments: the one we want back. */
  intentId: text("intent_id").notNull().references(() => paymentIntents.id),
  originalIntentId: text("original_intent_id").notNull().references(() => paymentIntents.id),
  payeeId: text("payee_id").references(() => payees.id),
  payeeName: text("payee_name").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  status: text("status").$type<RecoveryStatus>().notNull(),
  paypalInvoiceId: text("paypal_invoice_id"),
  requestedBy: text("requested_by"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The circle's own dashboard (AG Studio report state), saved so a view one
 * person builds is the one everyone opens. One per circle; none means Tend's.
 */
export const dashboards = pgTable("dashboards", {
  circleId: text("circle_id").primaryKey().references(() => circles.id),
  state: jsonb("state").$type<Record<string, unknown>>().notNull(),
  savedBy: text("saved_by").references(() => members.id),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Circle = typeof circles.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Payee = typeof payees.$inferSelect;
export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type Recovery = typeof recoveries.$inferSelect;
export type Contribution = typeof contributions.$inferSelect;
