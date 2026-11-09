import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { originOf } from "@/lib/origin";

export const runtime = "nodejs";

/** Sign out on this device. Their invite link signs them back in. */
export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/", originOf(req)), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
