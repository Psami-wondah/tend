import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { seedAll } from "@/lib/db/seed-demo";
import { scanForDuplicates } from "@/lib/recoveries";
import { fail } from "@/lib/http";
import { pushRestore, pushSnapshot } from "@/lib/push";
import { examplesOn } from "@/lib/examples";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Wipe and re-seed the example circles, for anyone trying Tend and for
 * retaking the video. Circles people set up themselves are never touched.
 * Turn it off on a public deploy with TEND_ALLOW_RESET=0.
 */
export async function POST() {
  if (!examplesOn()) return NextResponse.json({ error: "There are no example circles on this Tend." }, { status: 403 });
  if (process.env.TEND_ALLOW_RESET === "0") return NextResponse.json({ error: "Reset is turned off on this deploy." }, { status: 403 });
  try {
    const db = await getDb();
    // Phones that had alerts on keep them, and the people keep their ids, so everyone stays signed in.
    const devices = await pushSnapshot();
    const demo = sql`(SELECT id FROM circles WHERE story IS NOT NULL)`;
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM push_subscriptions WHERE member_id IN (SELECT id FROM members WHERE circle_id IN ${demo})`);
      for (const table of ["dashboards", "recoveries", "alerts", "audit_events", "ledger_entries", "contributions"]) {
        await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE circle_id IN ${demo}`);
      }
      await tx.execute(sql`DELETE FROM approvals WHERE intent_id IN (SELECT id FROM payment_intents WHERE circle_id IN ${demo})`);
      for (const table of ["payment_intents", "intakes", "mandates", "payees", "members"]) {
        await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE circle_id IN ${demo}`);
      }
      await tx.execute(sql`DELETE FROM circles WHERE story IS NOT NULL`);
    });
    await seedAll();
    await pushRestore(devices);
    await scanForDuplicates();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
