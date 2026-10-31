import { NextResponse } from "next/server";
import { z } from "zod";
import { dismissRecovery, requestRecovery, simulateRecoveryPaid, RecoveryError } from "@/lib/recoveries";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const Input = z.object({ memberId: z.string(), action: z.enum(["request", "dismiss", "simulate-paid"]) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    if (input.action === "request") return NextResponse.json(await requestRecovery(id, input.memberId));
    if (input.action === "dismiss") return NextResponse.json({ recovery: await dismissRecovery(id, input.memberId) });
    return NextResponse.json({ recovery: await simulateRecoveryPaid(id) });
  } catch (e) {
    if (e instanceof RecoveryError) return bad(e.message, 422);
    return fail(e);
  }
}
