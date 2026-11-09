import { NextResponse } from "next/server";
import { speech, voiceConfigured } from "@/lib/voice";

export const runtime = "nodejs";

/**
 * Reads an answer aloud in a natural voice. The text is posted, never put in
 * the URL, because answers name people and amounts. Same-origin only, short
 * texts, rate limited; with no voice set up the page uses the browser's own.
 */

const MAX_CHARS = 700;
const WINDOW_MS = 10 * 60_000;
const MAX_LINES = 60;
const lines = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (lines.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  lines.set(ip, recent);
  return recent.length > MAX_LINES;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return Boolean(origin && host && new URL(origin).host === host);
}

export async function POST(req: Request) {
  if (!voiceConfigured()) return NextResponse.json({ error: "No voice is set up." }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ error: "Too many at once." }, { status: 429 });

  const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "Nothing to read." }, { status: 400 });
  if (text.length > MAX_CHARS) return NextResponse.json({ error: "Too long to read aloud." }, { status: 413 });

  try {
    const { audio, type } = await speech(text.trim());
    return new NextResponse(new Uint8Array(audio), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.error("speech failed", e);
    return NextResponse.json({ error: "The voice didn't answer." }, { status: 502 });
  }
}
