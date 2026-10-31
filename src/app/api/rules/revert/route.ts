import { NextResponse } from "next/server";
import { z } from "zod";
import { revertTo, RulesError } from "@/lib/rules";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const [input, err] = await body(req, z.object({ memberId: z.string(), version: z.number().int().min(1) }));
  if (err) return err;
  try {
    return NextResponse.json(await revertTo(input.memberId, input.version));
  } catch (e) {
    if (e instanceof RulesError) return bad(e.message, 422);
    return fail(e);
  }
}
