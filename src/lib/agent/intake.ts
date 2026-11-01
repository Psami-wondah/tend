import { generateObject, type UserContent } from "ai";
import { ExtractionSchema, type Extraction } from "./schemas";
import { model } from "./model";

const SYSTEM = `You are Tend's intake reader. An older person (or their carer) has sent you
a photo of a document, a transcribed voice note, or a message they received.

Your only job is to read it carefully and fill in the schema. You do NOT decide
whether to pay — a separate rule engine and the family do that.

Guidance:
- Amounts: use the total due, not a subtotal or an item price. Null if no amount is stated.
- Payee: the business or person asking to be paid, exactly as written.
- Category: pick the closest. Prescriptions and chemists are "pharmacy"; home help is "carer".
- Method: normal bills from businesses are "paypal". Only choose gift_card, crypto,
  wire or cash_courier if the text actually asks for that.
- Scam signals: older people are targeted by "grandchild in trouble", fake bank,
  fake police, tech-support, prize and romance scams. Be alert but fair — a
  pharmacy bill with a reference number is not suspicious just because it has a due date.
- Tend refuses outright only when impersonation, secrecy or unusualMethod is true, so set
  those only when the text really shows them. Someone claiming to be Medicare, Social
  Security, the IRS, a bank, the police, a delivery company or tech support is
  impersonation. A stranger in a hurry (a roofer at the door wanting a deposit today) is
  urgency and unsolicited, not impersonation: score the risk honestly and the circle checks it.
- PayPal's own invoices and money requests are a common scam channel: the email is genuinely
  from PayPal, but the scammer types a fake "support" phone number in the note ("call within
  12 hours to dispute this $499 charge"). If you see that, fill paypalNative with the phone
  number and score the scam risk high. A normal PayPal invoice from a business they use, with
  no phone number to call, is not suspicious.
- Write the summary for the older person: short, warm, no jargon.`;

export interface IntakeInput {
  source: "photo" | "voice" | "text";
  text?: string | null;
  /** data: URL of an image (jpeg/png/webp) */
  imageDataUrl?: string | null;
  careRecipientName: string;
  knownPayees: string[];
  currency: string;
}

export async function extract(input: IntakeInput): Promise<Extraction> {
  const content: UserContent = [];
  const intro =
    input.source === "photo"
      ? `${input.careRecipientName} took a photo of this.`
      : input.source === "voice"
        ? `${input.careRecipientName} said this (voice note, transcribed):`
        : `${input.careRecipientName} forwarded this message:`;

  content.push({
    type: "text",
    text: `${intro}
The family's usual currency is ${input.currency}.
Payees the family already pays: ${input.knownPayees.join(", ") || "none yet"}.`,
  });
  if (input.imageDataUrl) {
    content.push({ type: "image", image: input.imageDataUrl });
  }
  if (input.text) {
    content.push({ type: "text", text: `"""\n${input.text}\n"""` });
  }

  const { object } = await generateObject({
    model: model(),
    schema: ExtractionSchema,
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  return object;
}
