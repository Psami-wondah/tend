import { NextResponse } from "next/server";
import { clientToken, paypalMode } from "@/lib/paypal/rest";
import { fail } from "@/lib/http";
import { originOf } from "@/lib/origin";

export const runtime = "nodejs";

/** Browser-safe token for the PayPal JavaScript SDK v6. */
export async function GET(req: Request) {
  if (paypalMode() === "simulated") return NextResponse.json({ simulated: true });
  try {
    const site = new URL(originOf(req));
    return NextResponse.json(await clientToken(site.hostname));
  } catch (e) {
    return fail(e);
  }
}
