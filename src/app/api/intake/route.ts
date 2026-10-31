import { NextResponse } from "next/server";
import { z } from "zod";
import { CantReadError, handleIntake } from "@/lib/agent/pipeline";
import { body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const Input = z
  .object({
    source: z.enum(["photo", "voice", "text"]),
    text: z.string().max(5000).nullish(),
    // ~6MB base64 cap; the client downsizes photos before sending.
    imageDataUrl: z.string().startsWith("data:image/").max(8_000_000).nullish(),
    submittedBy: z.string().nullish(),
    sampleId: z.string().max(40).nullish(),
  })
  .refine((v) => v.text || v.imageDataUrl, "Send a photo or some text");

export async function POST(req: Request) {
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    const result = await handleIntake(input);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof CantReadError) return NextResponse.json({ outcome: "failed", message: e.message }, { status: 422 });
    return fail(e);
  }
}
