import { NextResponse } from "next/server";
import { z } from "zod";
import { shopFor } from "@/lib/shopping";
import { handleIntake } from "@/lib/agent/pipeline";
import { getCircle, getMember } from "@/lib/circle";
import { isFamily } from "@/lib/people";
import { CATEGORIES } from "@/lib/mandate/types";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const Input = z.object({
  memberId: z.string(),
  query: z.string().min(2).max(200),
  maxPrice: z.number().positive().max(5000).nullable(),
  productId: z.string().max(200),
  category: z.enum(CATEGORIES).default("equipment"),
});

/**
 * Propose buying a product Tend found. The price is re-read from the
 * catalogue here, never taken from the browser, and the purchase goes
 * through the family's mandate like any other payment.
 */
export async function POST(req: Request) {
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    const circle = await getCircle();
    const me = await getMember(input.memberId);
    if (!me || me.circleId !== circle.id || !isFamily(me)) return bad("Only the family can buy things from the pot.", 403);
    const found = await shopFor(input.query, input.maxPrice, circle.currency);
    const product = found.products.find((p) => p.id === input.productId);
    if (!product) return bad("That item isn't available at that price any more. Search again.", 409);
    const offer = product.best;
    const result = await handleIntake({
      source: "text",
      submittedBy: me.id,
      text: `${me.name} asked Tend to buy "${product.title}" from ${offer.domain}${offer.url ? ` (${offer.url})` : ""}.`,
      preExtracted: {
        kind: "bill",
        isPaymentRequest: true,
        payeeName: offer.domain,
        payeeEmail: null,
        amount: offer.priceMinor / 100,
        currency: offer.currency,
        category: input.category,
        method: "paypal",
        reference: `${found.source === "channel3" ? "C3" : "SAMPLE"}-${product.id}`.slice(0, 60),
        dueDate: null,
        summary: `${product.title} for ${circle.careRecipientName}, from ${offer.domain}`,
        scam: {
          impersonation: false,
          urgency: false,
          secrecy: false,
          unusualMethod: false,
          unsolicited: false,
          riskScore: 0,
          explanation: `Chosen by ${me.name} from a ${found.source === "channel3" ? "Channel3" : "sample catalogue"} product search.`,
        },
        confidence: 1,
      },
    });
    return NextResponse.json({ outcome: result.outcome, message: result.message, paymentId: result.intent?.id ?? null });
  } catch (e) {
    return fail(e);
  }
}
