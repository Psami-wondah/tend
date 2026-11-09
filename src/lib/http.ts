import { NextResponse } from "next/server";
import { z } from "zod";
import { viewerId } from "./viewer";

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Fields that name who is acting. They must be whoever is signed in on this device. */
const ACTOR_FIELDS = ["memberId", "payerId", "submittedBy"] as const;

/**
 * Parse a JSON body with a Zod schema; returns [data, errorResponse].
 * Anyone a request says is acting must be the person signed in, so a
 * request can't act as someone else in the circle.
 */
export async function body<T extends z.ZodType>(
  req: Request,
  schema: T,
  opts: { signIn?: boolean } = {},
): Promise<[z.infer<T>, null] | [null, NextResponse]> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return [null, bad("Body must be JSON")];
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return [null, bad(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))];
  if (!opts.signIn && parsed.data && typeof parsed.data === "object") {
    const named = ACTOR_FIELDS.map((f) => (parsed.data as Record<string, unknown>)[f]).filter((v): v is string => typeof v === "string");
    if (named.length) {
      const me = await viewerId();
      if (!me) return [null, bad("Open Tend from your invite link to sign in.", 401)];
      if (named.some((id) => id !== me)) return [null, bad("That's someone else in the circle. Only they can do this.", 403)];
    }
  }
  return [parsed.data, null];
}

export function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  return NextResponse.json({ error: message }, { status: 500 });
}
