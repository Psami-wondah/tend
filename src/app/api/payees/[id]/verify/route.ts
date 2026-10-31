import { NextResponse } from "next/server";
import { z } from "zod";
import { sendVerificationCent, PayeeError } from "@/lib/payees";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Send the one-cent check payout with a code in its note. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [input, err] = await body(req, z.object({ memberId: z.string() }));
  if (err) return err;
  try {
    return NextResponse.json(await sendVerificationCent(id, input.memberId));
  } catch (e) {
    if (e instanceof PayeeError) return bad(e.message, 422);
    return fail(e);
  }
}
