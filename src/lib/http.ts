import { NextResponse } from "next/server";
import { z } from "zod";

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Parse a JSON body with a Zod schema; returns [data, errorResponse]. */
export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<[z.infer<T>, null] | [null, NextResponse]> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return [null, bad("Body must be JSON")];
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return [null, bad(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))];
  return [parsed.data, null];
}

export function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(err);
  return NextResponse.json({ error: message }, { status: 500 });
}
