import { NextResponse } from "next/server";
import { listCircles } from "@/lib/circle";
import { integrations } from "@/lib/setup";
import { dbFallbackReason } from "@/lib/db/client";
import { examplesOn } from "@/lib/examples";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Render health check: the database answers. A Tend with no circles yet is
 * healthy too: on live PayPal there are no examples until someone sets one up.
 */
export async function GET() {
  try {
    const circles = await listCircles();
    const i = integrations();
    const fallback = dbFallbackReason();
    return NextResponse.json({
      ok: true,
      circle: circles[0]?.name ?? null,
      circles: circles.length,
      examples: examplesOn(),
      paypal: i.paypal,
      ai: i.ai,
      database: fallback ? "embedded (DATABASE_URL unreachable)" : i.database,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
