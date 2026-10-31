import { NextResponse } from "next/server";
import { z } from "zod";
import { revokeVault } from "@/lib/vault";
import { body, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const [input, err] = await body(req, z.object({ memberId: z.string() }));
  if (err) return err;
  try {
    await revokeVault(input.memberId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
