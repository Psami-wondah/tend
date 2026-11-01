import { NextResponse } from "next/server";
import { clientToken, paypalMode } from "@/lib/paypal/rest";
import { fail } from "@/lib/http";

export const runtime = "nodejs";

/** Browser-safe token for the PayPal JavaScript SDK v6. */
export async function GET(req: Request) {
  if (paypalMode() === "simulated") return NextResponse.json({ simulated: true });
  try {
    const site = process.env.APP_URL?.startsWith("http") ? new URL(process.env.APP_URL) : new URL(req.url);
    return NextResponse.json(await clientToken(site.hostname));
  } catch (e) {
    return fail(e);
  }
}
