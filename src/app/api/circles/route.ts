import { NextResponse } from "next/server";
import { createCircle, NewCircle } from "@/lib/onboarding";
import { inviteToken, sessionCookie, sessionFor, SESSION_COOKIE } from "@/lib/session";
import { body, fail } from "@/lib/http";
import { originOf } from "@/lib/origin";

export const runtime = "nodejs";

/**
 * Set Tend up for someone. The person doing it becomes the circle's first
 * second key and is signed in on this device; everyone gets their own
 * invite link, which signs them in wherever they open it.
 */
export async function POST(req: Request) {
  const [input, err] = await body(req, NewCircle);
  if (err) return err;
  try {
    const { circle, person, helpers } = await createCircle(input);
    const origin = originOf(req);
    const links = await Promise.all(
      [person, ...helpers].map(async (m) => ({ id: m.id, name: m.name, role: m.role, relation: m.relation, url: `${origin}/join/${await inviteToken(m.id)}` })),
    );
    const res = NextResponse.json({ circleId: circle.id, links });
    res.cookies.set(SESSION_COOKIE, await sessionFor(helpers[0].id), sessionCookie(req));
    return res;
  } catch (e) {
    return fail(e);
  }
}
