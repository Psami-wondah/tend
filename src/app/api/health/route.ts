import { NextResponse } from "next/server";
import { getCircle } from "@/lib/circle";
import { integrations } from "@/lib/setup";
import { dbFallbackReason } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Render health check: the database answers and a circle exists. */
export async function GET() {
  try {
    const circle = await getCircle();
    const i = integrations();
    const fallback = dbFallbackReason();
    return NextResponse.json({ ok: true, circle: circle.name, paypal: i.paypal, ai: i.ai, database: fallback ? "embedded (DATABASE_URL unreachable)" : i.database });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
