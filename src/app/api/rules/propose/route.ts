import { NextResponse } from "next/server";
import { z } from "zod";
import { proposeRuleChange } from "@/lib/rules";
import { body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Plain English → proposed rule changes. Nothing is saved here. */
export async function POST(req: Request) {
  const [input, err] = await body(req, z.object({ text: z.string().min(3).max(500) }));
  if (err) return err;
  try {
    return NextResponse.json(await proposeRuleChange(input.text));
  } catch (e) {
    return fail(e);
  }
}
