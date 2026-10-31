import { NextResponse } from "next/server";
import { z } from "zod";
import { interpretPassbookQuestion } from "@/lib/agent/passbook-query";
import { getCircle, getMembers } from "@/lib/circle";
import { body, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

/** A question about the passbook → a filter the grid applies. */
export async function POST(req: Request) {
  const [input, err] = await body(req, z.object({ question: z.string().min(2).max(300) }));
  if (err) return err;
  try {
    const circle = await getCircle();
    const people = (await getMembers(circle.id)).map((m) => m.name);
    return NextResponse.json(await interpretPassbookQuestion(input.question, people));
  } catch (e) {
    return fail(e);
  }
}
