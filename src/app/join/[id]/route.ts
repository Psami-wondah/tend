import { NextResponse } from "next/server";
import { getCircleById, getMember, getMembers, listCircles } from "@/lib/circle";
import { readInvite, sessionCookie, sessionFor, SESSION_COOKIE } from "@/lib/session";
import { originOf } from "@/lib/origin";

export const runtime = "nodejs";

/**
 * A person's invite link. Opening it signs them in on this device and lands
 * them on the screen that's theirs: the big-button screen for the person at
 * the centre, the circle's home for everyone else. The Home Screen app
 * starts here too, so it stays signed in even where an installed web app
 * keeps its own cookies (iPhone).
 *
 * The example circles also answer to a first name (/join/walter), which
 * survives a demo reset. Real circles need the signed token.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const base = originOf(req);
  const fromInvite = await readInvite(decodeURIComponent(id));
  let m = fromInvite ? await getMember(fromInvite) : null;
  if (!m) {
    const demo = (await listCircles()).filter((c) => c.story);
    const people = (await Promise.all(demo.map((c) => getMembers(c.id)))).flat();
    m = people.find((p) => p.name.toLowerCase() === decodeURIComponent(id).toLowerCase()) ?? null;
    if (!m) {
      // A bare id still works for the example circles, never for a real one.
      const byId = await getMember(id);
      if (byId && (await getCircleById(byId.circleId)).story) m = byId;
    }
  }
  if (!m) return NextResponse.redirect(new URL("/signin?link=expired", base));
  const res = NextResponse.redirect(new URL(m.role === "care_recipient" ? "/me" : "/home", base));
  res.cookies.set(SESSION_COOKIE, await sessionFor(m.id), sessionCookie(req));
  return res;
}
