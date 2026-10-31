import { NextResponse } from "next/server";
import { z } from "zod";
import { ApprovalError, recordVerdict } from "@/lib/agent/approvals";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const Input = z.object({
  memberId: z.string(),
  verdict: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    const intent = await recordVerdict({ intentId: id, ...input });
    return NextResponse.json({ intent });
  } catch (e) {
    if (e instanceof ApprovalError) return bad(e.message, 403);
    return fail(e);
  }
}
