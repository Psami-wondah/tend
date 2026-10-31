import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmOwnPayment, OwnPaymentError } from "@/lib/own-payments";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** They approved in PayPal: place the authorization, then pay now or hold. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [input, err] = await body(req, z.object({ orderId: z.string().min(3) }));
  if (err) return err;
  try {
    const r = await confirmOwnPayment(id, input.orderId);
    return NextResponse.json({ outcome: r.outcome, message: r.message, holdUntil: r.intent?.holdUntil ?? null });
  } catch (e) {
    if (e instanceof OwnPaymentError) return bad(e.message, 409);
    return fail(e);
  }
}
