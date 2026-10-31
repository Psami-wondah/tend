import { NextResponse } from "next/server";
import { z } from "zod";
import { completeTopUp } from "@/lib/contributions";
import { body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const [input, err] = await body(req, z.object({ orderId: z.string() }));
  if (err) return err;
  try {
    await completeTopUp(input.orderId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
