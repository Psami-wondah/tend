import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { seedAll } from "@/lib/db/seed-demo";
import { scanForDuplicates } from "@/lib/recoveries";
import { fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Wipe and re-seed both demo circles, for judges and for retaking the video.
 * Disable on a public deploy with TEND_ALLOW_RESET=0.
 */
export async function POST() {
  if (process.env.TEND_ALLOW_RESET === "0") return NextResponse.json({ error: "Reset is turned off on this deploy." }, { status: 403 });
  try {
    const db = await getDb();
    await db.execute(sql`TRUNCATE recoveries, alerts, audit_events, ledger_entries, contributions, approvals,
      payment_intents, intakes, mandates, payees, members, circles CASCADE`);
    await seedAll();
    await scanForDuplicates();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
