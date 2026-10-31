import { NextResponse } from "next/server";
import { z } from "zod";
import { attachPayee, PayeeError } from "@/lib/payees";
import { CATEGORIES } from "@/lib/mandate/types";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const Input = z.object({
  memberId: z.string(),
  payeeId: z.string().optional(),
  newPayee: z
    .object({ name: z.string().min(1).max(120), paypalEmail: z.string().min(3).max(200), kind: z.enum(CATEGORIES), vouch: z.boolean() })
    .optional(),
});

/** Attach a payee to a waiting payment (adding them if new), then re-run the mandate. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    return NextResponse.json({ intent: await attachPayee({ intentId: id, ...input }) });
  } catch (e) {
    if (e instanceof PayeeError) return bad(e.message, 422);
    return fail(e);
  }
}
