import { NextResponse } from "next/server";
import { z } from "zod";
import { startTopUp } from "@/lib/contributions";
import { body, fail } from "@/lib/http";

export const runtime = "nodejs";

const Input = z.object({ memberId: z.string(), amount: z.number().min(1).max(5000) });

export async function POST(req: Request) {
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    return NextResponse.json(await startTopUp(input.memberId, Math.round(input.amount * 100)));
  } catch (e) {
    return fail(e);
  }
}
