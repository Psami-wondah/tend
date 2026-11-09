import { NextResponse } from "next/server";
import { z } from "zod";
import { PushError, pushKeys, subscribe, unsubscribe } from "@/lib/push";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";

/** The public key a browser needs to subscribe to the circle's alerts. */
export async function GET() {
  return NextResponse.json({ publicKey: (await pushKeys()).publicKey });
}

const Subscription = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

/** Turn alerts on for this device, for one person in the circle. */
export async function POST(req: Request) {
  const [input, err] = await body(req, z.object({ memberId: z.string(), subscription: Subscription }));
  if (err) return err;
  try {
    await subscribe(input.memberId, input.subscription);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PushError) return bad(e.message, 403);
    return fail(e);
  }
}

/** Turn them off again. */
export async function DELETE(req: Request) {
  const [input, err] = await body(req, z.object({ memberId: z.string(), endpoint: z.string().max(1000) }));
  if (err) return err;
  await unsubscribe(input.memberId, input.endpoint);
  return NextResponse.json({ ok: true });
}
