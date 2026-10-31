import { NextResponse } from "next/server";
import { z } from "zod";
import { OwnPaymentError, startOwnPayment } from "@/lib/own-payments";
import { CantReadError } from "@/lib/agent/pipeline";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const Input = z
  .object({
    payerId: z.string(),
    source: z.enum(["photo", "voice", "text"]),
    text: z.string().max(5000).nullish(),
    imageDataUrl: z.string().startsWith("data:image/").max(8_000_000).nullish(),
    sampleId: z.string().max(40).nullish(),
    payToEmail: z.string().email().max(200).nullish(),
  })
  .refine((v) => v.text || v.imageDataUrl, "Send a photo or some text");

/** The person wants to pay someone from their own PayPal: read it, decide, prepare the hold. */
export async function POST(req: Request) {
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    const r = await startOwnPayment(input);
    return NextResponse.json({ outcome: r.outcome, message: r.message, intentId: r.intent?.id ?? null, orderId: r.orderId ?? null, plan: r.plan ?? null });
  } catch (e) {
    if (e instanceof CantReadError) return NextResponse.json({ outcome: "failed", message: e.message }, { status: 422 });
    if (e instanceof OwnPaymentError) return bad(e.message, 403);
    return fail(e);
  }
}
