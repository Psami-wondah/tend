import { NextResponse } from "next/server";
import { z } from "zod";
import { saveMandate, RulesError } from "@/lib/rules";
import { bad, body, fail } from "@/lib/http";
import type { Mandate } from "@/lib/mandate/types";

export const runtime = "nodejs";

const Input = z.object({ memberId: z.string(), mandate: z.record(z.string(), z.unknown()) });

export async function POST(req: Request) {
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    return NextResponse.json(await saveMandate(input.memberId, input.mandate as unknown as Mandate));
  } catch (e) {
    if (e instanceof RulesError) return bad(e.message, 422);
    return fail(e);
  }
}
