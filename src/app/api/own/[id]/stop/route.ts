import { NextResponse } from "next/server";
import { z } from "zod";
import { OwnPaymentError, stopOwnPayment } from "@/lib/own-payments";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";

/** Stop a held payment: the authorization is voided and nothing leaves their account. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [input, err] = await body(req, z.object({ memberId: z.string(), note: z.string().max(300).optional() }));
  if (err) return err;
  try {
    return NextResponse.json({ intent: await stopOwnPayment(id, input.memberId, input.note) });
  } catch (e) {
    if (e instanceof OwnPaymentError) return bad(e.message, 409);
    return fail(e);
  }
}
