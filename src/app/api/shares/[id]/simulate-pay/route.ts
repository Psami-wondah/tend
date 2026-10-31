import { NextResponse } from "next/server";
import { z } from "zod";
import { simulatePayShare } from "@/lib/contributions";
import { bad, body } from "@/lib/http";

export const runtime = "nodejs";

/** Demo mode: stand in for paying a simulated share invoice in PayPal. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [input, err] = await body(req, z.object({ memberId: z.string() }));
  if (err) return err;
  try {
    await simulatePayShare(id, input.memberId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e), 422);
  }
}
