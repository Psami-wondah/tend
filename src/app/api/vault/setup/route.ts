import { NextResponse } from "next/server";
import { z } from "zod";
import { startVault, VaultError } from "@/lib/vault";
import { bad, body, fail } from "@/lib/http";
import { originOf } from "@/lib/origin";

export const runtime = "nodejs";

const Input = z.object({ memberId: z.string(), maxPerPayment: z.number().positive().max(2000), payeeIds: z.array(z.string()).min(1).max(10) });

/** Start saving the person's PayPal (Vault setup token). Returns PayPal's approval link. */
export async function POST(req: Request) {
  const [input, err] = await body(req, Input);
  if (err) return err;
  try {
    const appUrl = originOf(req);
    return NextResponse.json(await startVault({ memberId: input.memberId, maxPerPaymentMinor: Math.round(input.maxPerPayment * 100), payeeIds: input.payeeIds, appUrl }));
  } catch (e) {
    if (e instanceof VaultError) return bad(e.message, 422);
    return fail(e);
  }
}
