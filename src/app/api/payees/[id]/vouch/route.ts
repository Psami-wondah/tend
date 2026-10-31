import { NextResponse } from "next/server";
import { z } from "zod";
import { vouchForPayee, PayeeError } from "@/lib/payees";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [input, err] = await body(req, z.object({ memberId: z.string() }));
  if (err) return err;
  try {
    return NextResponse.json({ payee: await vouchForPayee(id, input.memberId) });
  } catch (e) {
    if (e instanceof PayeeError) return bad(e.message, 422);
    return fail(e);
  }
}
