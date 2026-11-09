import { NextResponse } from "next/server";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { alerts } from "@/lib/db/schema";
import { getMember } from "@/lib/circle";
import { viewerId } from "@/lib/viewer";
import { isFamily } from "@/lib/people";

export const runtime = "nodejs";

/**
 * What's new for the signed-in person's circle since `after` (ms), for the
 * banner that slides in while Tend is open. Phones with alerts on also get
 * a notification; this is the same moment inside the app, on any device.
 */
export async function GET(req: Request) {
  const id = await viewerId();
  const me = id ? await getMember(id) : null;
  if (!me || !isFamily(me)) return NextResponse.json({ now: Date.now(), alerts: [] });
  const now = Date.now();
  // The first check (no `after`) returns what's recent too, so the banner knows not to show it.
  const given = Number(new URL(req.url).searchParams.get("after"));
  const after = Number.isFinite(given) && given > 0 ? given : now;
  const db = await getDb();
  // A little overlap: an alert is stamped when its transaction began, which can be before the last check. The banner skips ones it has shown.
  const rows = await db
    .select({ id: alerts.id, intentId: alerts.intentId, severity: alerts.severity, title: alerts.title, body: alerts.body, createdAt: alerts.createdAt })
    .from(alerts)
    .where(and(eq(alerts.circleId, me.circleId), inArray(alerts.severity, ["action", "danger"]), gt(alerts.createdAt, new Date(after - 30_000))))
    .orderBy(desc(alerts.createdAt))
    .limit(5);
  return NextResponse.json({ now, alerts: rows }, { headers: { "Cache-Control": "no-store" } });
}
