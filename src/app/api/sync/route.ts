import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { syncInvoices } from "@/lib/contributions";
import { syncRecoveries } from "@/lib/recoveries";
import { refreshPayout } from "@/lib/agent/executor";
import { settleDueHolds } from "@/lib/own-payments";
import { fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Catch up with PayPal when webhooks can't reach us (e.g. on localhost):
 * settle payouts still "paying", release cooling-off holds that have ended,
 * and settle invoices that have been paid. The dashboard calls it while
 * anything is in flight; the Render cron job calls it every few minutes with
 * CRON_SECRET.
 */
async function sync() {
  const db = await getDb();
  // Every circle: payouts still settling, then cooling-off holds that have ended.
  const paying = await db
    .select({ id: schema.paymentIntents.id })
    .from(schema.paymentIntents)
    .where(and(eq(schema.paymentIntents.status, "paying")));
  for (const p of paying) await refreshPayout(p.id).catch(() => undefined);
  const holds = await settleDueHolds();
  await syncInvoices();
  await syncRecoveries();
  return { ok: true, refreshed: paying.length, holdsSettled: holds.length };
}

export async function POST() {
  try {
    return NextResponse.json(await sync());
  } catch (e) {
    return fail(e);
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await sync());
  } catch (e) {
    return fail(e);
  }
}
