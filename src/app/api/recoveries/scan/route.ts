import { NextResponse } from "next/server";
import { scanForDuplicates } from "@/lib/recoveries";
import { fail } from "@/lib/http";

export const runtime = "nodejs";

/** Look for bills paid twice. */
export async function POST() {
  try {
    const found = await scanForDuplicates();
    return NextResponse.json({ found: found.length });
  } catch (e) {
    return fail(e);
  }
}
