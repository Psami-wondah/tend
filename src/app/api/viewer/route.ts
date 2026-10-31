import { NextResponse } from "next/server";
import { z } from "zod";
import { getMember } from "@/lib/circle";
import { VIEWER_COOKIE } from "@/lib/viewer";
import { bad, body } from "@/lib/http";

export const runtime = "nodejs";

/** Pick who you're viewing Tend as (demo stand-in for sign-in). */
export async function POST(req: Request) {
  const [input, err] = await body(req, z.object({ memberId: z.string() }));
  if (err) return err;
  // The member decides the circle: getCircle() follows this cookie from now on.
  const m = await getMember(input.memberId);
  if (!m) return bad("Unknown member", 404);
  const res = NextResponse.json({ ok: true, role: m.role });
  res.cookies.set(VIEWER_COOKIE, m.id, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
  return res;
}
