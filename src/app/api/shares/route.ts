import { NextResponse } from "next/server";
import { z } from "zod";
import { requestShares } from "@/lib/contributions";
import { body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const Input = z.object({ total: z.number().min(1).max(20000), note: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    return NextResponse.json(await requestShares(Math.round(input.total * 100), input.note));
  } catch (e) {
    return fail(e);
  }
}
