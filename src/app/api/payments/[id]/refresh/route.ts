import { NextResponse } from "next/server";
import { refreshPayout } from "@/lib/agent/executor";
import { fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ intent: await refreshPayout(id) });
  } catch (e) {
    return fail(e);
  }
}
