import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { syncInvoices } from "@/lib/contributions";
import { refreshPayout } from "@/lib/agent/executor";
import { paypalConfigured } from "@/lib/paypal/rest";
import { getCircle } from "@/lib/circle";
import { fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Catch up with PayPal when webhooks can't reach us (e.g. on localhost). */
export async function POST() {
  if (!paypalConfigured()) return NextResponse.json({ ok: false, reason: "PayPal not configured" });
  try {
    const db = await getDb();
    const circle = await getCircle();
    const paying = await db
      .select({ id: schema.paymentIntents.id })
      .from(schema.paymentIntents)
      .where(and(eq(schema.paymentIntents.circleId, circle.id), eq(schema.paymentIntents.status, "paying")));
    for (const p of paying) await refreshPayout(p.id);
    await syncInvoices();
    return NextResponse.json({ ok: true, refreshed: paying.length });
  } catch (e) {
    return fail(e);
  }
}
