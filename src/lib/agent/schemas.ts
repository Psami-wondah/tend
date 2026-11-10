import { z } from "zod";
import { CATEGORIES, PAYMENT_METHODS } from "../mandate/types";

/**
 * What the model must return after reading a photo, voice note or message.
 * The model fills this in; it never decides whether to pay.
 */
export const ExtractionSchema = z.object({
  kind: z
    .enum(["bill", "invoice", "prescription", "receipt", "payment_request", "message", "not_a_payment"])
    .describe("What the document or message is."),
  isPaymentRequest: z
    .boolean()
    .describe("True if someone is asking for money to be paid."),
  payeeName: z
    .string()
    .describe("Who is asking to be paid, as written. Empty string if unclear."),
  payeeEmail: z
    .string()
    .nullable()
    .describe("Email or PayPal address shown for the payee, if any."),
  amount: z
    .number()
    .nullable()
    .describe("Total amount due, in major units (e.g. 24.50). Null if not stated."),
  currency: z.string().describe("ISO currency code, e.g. USD or GBP. Guess from symbols if needed."),
  category: z.enum(CATEGORIES),
  method: z
    .enum(PAYMENT_METHODS)
    .describe(
      "How the requester wants to be paid. 'paypal' for normal bills from a business. gift_card/crypto/wire/cash_courier if asked for those.",
    ),
  reference: z
    .string()
    .nullable()
    .describe("Invoice number, prescription number or account reference."),
  dueDate: z.string().nullable().describe("Due date as YYYY-MM-DD if shown."),
  summary: z
    .string()
    .describe(
      "One short, plain-English sentence that reads right to the person and to their circle, with no 'you' or 'your', e.g. 'Blood pressure tablets from Riverside Pharmacy.'",
    ),
  scam: z.object({
    impersonation: z.boolean().describe("Claims to be a relative, bank, government, police or tech support."),
    urgency: z.boolean().describe("Pressure to pay immediately or face consequences."),
    secrecy: z.boolean().describe("Asks not to tell family or anyone else."),
    unusualMethod: z.boolean().describe("Asks for gift cards, crypto, wire, or cash collection."),
    unsolicited: z.boolean().describe("A request they didn't start (not a normal bill for a service they use)."),
    riskScore: z.number().min(0).max(1).describe("Overall probability this is a scam."),
    explanation: z.string().describe("Why, in one or two plain sentences, with no 'you' or 'your' (the circle reads it too)."),
  }),
  confidence: z.number().min(0).max(1).describe("Confidence in the extracted amount and payee."),
  paypalNative: z
    .object({
      kind: z.enum(["invoice", "money_request", "account_alert"]),
      phoneInNote: z
        .string()
        .nullable()
        .describe("A phone number written in the invoice or request note, or in the message, telling them to call. PayPal never puts support numbers in invoice notes."),
    })
    .nullish()
    .describe("Set only if this came through PayPal itself: a real PayPal invoice, a PayPal money request, or a PayPal-branded alert email. Null otherwise."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
