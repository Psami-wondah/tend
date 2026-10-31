import { NextResponse } from "next/server";
import { finishVault } from "@/lib/vault";

export const runtime = "nodejs";

/** PayPal sends the person back here after they approve saving their PayPal. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const member = url.searchParams.get("member");
  const token = url.searchParams.get("approval_token_id") ?? url.searchParams.get("token");
  const back = new URL("/me", url.origin);
  if (!member) return NextResponse.redirect(back);
  try {
    await finishVault(member, token);
    back.searchParams.set("vault", "saved");
  } catch {
    back.searchParams.set("vault", "failed");
  }
  return NextResponse.redirect(back);
}
