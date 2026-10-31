import { NextResponse } from "next/server";
import { z } from "zod";
import { addPayee, PayeeError } from "@/lib/payees";
import { CATEGORIES } from "@/lib/mandate/types";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";

const Input = z.object({
  memberId: z.string(),
  name: z.string().min(1).max(120),
  paypalEmail: z.string().min(3).max(200),
  kind: z.enum(CATEGORIES),
});

export async function POST(req: Request) {
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    return NextResponse.json({ payee: await addPayee(input) });
  } catch (e) {
    if (e instanceof PayeeError) return bad(e.message, 422);
    return fail(e);
  }
}
