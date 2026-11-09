import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { appSettings } from "./db/schema";

/**
 * Who's signed in on this device. Everyone gets into Tend from their own
 * invite link; opening it signs them in on that phone or laptop with a
 * signed session cookie, so nobody can be someone else by editing a cookie
 * or guessing an id.
 *
 * An invite link is the person's id plus a signature, so it can't be made up
 * from an id seen on a page. The secret comes from TEND_SESSION_SECRET, or is
 * made once and kept in the database.
 */

export const SESSION_COOKIE = "tend_as";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

let secret: string | null = null;

async function sessionSecret(): Promise<string> {
  if (secret) return secret;
  if (process.env.TEND_SESSION_SECRET) return (secret = process.env.TEND_SESSION_SECRET);
  const db = await getDb();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "session_secret"));
  if (row) return (secret = row.value);
  await db.insert(appSettings).values({ key: "session_secret", value: randomBytes(32).toString("base64url") }).onConflictDoNothing();
  const [kept] = await db.select().from(appSettings).where(eq(appSettings.key, "session_secret"));
  return (secret = kept.value);
}

async function sign(purpose: "session" | "invite", memberId: string) {
  return createHmac("sha256", await sessionSecret())
    .update(`${purpose}:${memberId}`)
    .digest("base64url")
    .slice(0, 27);
}

async function verify(purpose: "session" | "invite", value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const memberId = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const want = Buffer.from(await sign(purpose, memberId));
  return given.length === want.length && timingSafeEqual(given, want) ? memberId : null;
}

/** The cookie value that signs this person in. */
export async function sessionFor(memberId: string) {
  return `${memberId}.${await sign("session", memberId)}`;
}

export const readSession = (value: string | null | undefined) => verify("session", value);

/** The token in a person's invite link, /join/<token>. */
export async function inviteToken(memberId: string) {
  return `${memberId}.${await sign("invite", memberId)}`;
}

export const readInvite = (token: string | null | undefined) => verify("invite", token);

/** Cookie options: kept for a year, never readable by page scripts. */
export function sessionCookie(req: Request) {
  const https = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return { path: "/", sameSite: "lax" as const, httpOnly: true, secure: https, maxAge: SESSION_MAX_AGE };
}

/** The full invite link for someone, for pages to show and copy. */
export async function inviteLink(memberId: string) {
  const { pageOrigin } = await import("./origin");
  return `${await pageOrigin()}/join/${await inviteToken(memberId)}`;
}
