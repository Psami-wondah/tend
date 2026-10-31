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
  createdAt: createdAt(),
});

export const members = pgTable("members", {
  id: id(),
  circleId: text("circle_id").notNull().references(() => circles.id),
  name: text("name").notNull(),
  /** PayPal (sandbox) email — used for invoices and payouts. */
  email: text("email").notNull(),
  role: text("role", { enum: ["owner", "sibling", "care_recipient", "carer"] }).notNull(),
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
  | "failed";

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
  type: text("type", { enum: ["contribution", "payment", "refund"] }).notNull(),
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

export type Circle = typeof circles.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Payee = typeof payees.$inferSelect;
export type PaymentIntent = typeof paymentIntents.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
