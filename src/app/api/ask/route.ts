import { NextResponse } from "next/server";
import { z } from "zod";
import { askTend } from "@/lib/agent/assistant";
import { body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 120;

const Input = z.object({
  memberId: z.string(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(30),
});

export async function POST(req: Request) {
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    return NextResponse.json(await askTend(input));
  } catch (e) {
    return fail(e);
  }
}
