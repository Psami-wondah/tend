import { NextResponse } from "next/server";
import { z } from "zod";
import { getCircleById, getMember } from "@/lib/circle";
import { sessionCookie, sessionFor, SESSION_COOKIE } from "@/lib/session";
import { bad, body } from "@/lib/http";
import { examplesOn } from "@/lib/examples";

export const runtime = "nodejs";

/**
 * The demo's door: open one of the example circles as any of its people.
 * Real circles are only opened by each person's own invite link.
 */
export async function POST(req: Request) {
  const [input, err] = await body(req, z.object({ memberId: z.string() }), { signIn: true });
  if (err) return err;
  const m = await getMember(input.memberId);
  if (!m) return bad("Unknown member", 404);
  const circle = await getCircleById(m.circleId);
  if (!circle.story || !examplesOn()) return bad("Open your own circle from your invite link.", 403);
  const res = NextResponse.json({ ok: true, role: m.role });
  res.cookies.set(SESSION_COOKIE, await sessionFor(m.id), sessionCookie(req));
  return res;
}
