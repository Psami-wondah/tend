import { NextResponse } from "next/server";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { alerts } from "@/lib/db/schema";
import { getMember } from "@/lib/circle";
import { viewerId } from "@/lib/viewer";
import { isFamily } from "@/lib/people";
import { catchUp, circleVersion } from "@/lib/live";

export const runtime = "nodejs";

/**
 * What every open page asks every few seconds: has anything in my circle
 * changed (`version`), and is there something new to slide in as a banner
 * (`alerts`, newer than `after` ms, for the circle's helpers)? While PayPal
 * still has a payment, hold or invoice of theirs in hand, it asks PayPal for
 * news first, so the answer is as current as PayPal is.
 */
export async function GET(req: Request) {
  const now = Date.now();
  const id = await viewerId();
  const me = id ? await getMember(id) : null;
  if (!me) return NextResponse.json({ now, version: null, alerts: [] }, { headers: { "Cache-Control": "no-store" } });

  await catchUp(me.circleId, now).catch(() => undefined);

  // The first check (no `after`) returns what's recent too, so the banner knows not to show it.
  const given = Number(new URL(req.url).searchParams.get("after"));
  const after = Number.isFinite(given) && given > 0 ? given : now;
  const db = await getDb();
  const [version, recent] = await Promise.all([
    circleVersion(me.circleId),
    isFamily(me)
      ? // A little overlap: an alert is stamped when its transaction began, which can be before the last check. The banner skips ones it has shown.
        db
          .select({ id: alerts.id, intentId: alerts.intentId, severity: alerts.severity, title: alerts.title, body: alerts.body })
          .from(alerts)
          .where(and(eq(alerts.circleId, me.circleId), inArray(alerts.severity, ["action", "danger"]), gt(alerts.createdAt, new Date(after - 30_000))))
          .orderBy(desc(alerts.createdAt))
          .limit(5)
      : [],
  ]);
  return NextResponse.json({ now, version, alerts: recent }, { headers: { "Cache-Control": "no-store" } });
}
