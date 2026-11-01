import { NextResponse } from "next/server";
import { z } from "zod";
import { clearDashboard, DashboardError, saveDashboard } from "@/lib/report";
import { bad, body, fail } from "@/lib/http";

export const runtime = "nodejs";

/** Save the dashboard for everyone in the circle. */
export async function PUT(req: Request) {
  const [input, err] = await body(
    req,
    z.object({
      memberId: z.string(),
      state: z.record(z.string(), z.unknown()),
    }),
  );
  if (err) return err;
  try {
    return NextResponse.json(await saveDashboard(input.memberId, input.state));
  } catch (e) {
    if (e instanceof DashboardError) return bad(e.message, 422);
    return fail(e);
  }
}

/** Forget the circle's saved dashboard, so everyone sees Tend's again. */
export async function DELETE(req: Request) {
  const [input, err] = await body(req, z.object({ memberId: z.string() }));
  if (err) return err;
  try {
    await clearDashboard(input.memberId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DashboardError) return bad(e.message, 422);
    return fail(e);
  }
}
