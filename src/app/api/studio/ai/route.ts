import { NextResponse } from "next/server";
import { generateText, jsonSchema, Output, tool, type ToolSet } from "ai";
import { aiConfigured, model, modelId } from "@/lib/agent/model";
import { systemOf, toMessages, type StudioTurn } from "@/lib/agent/studio-turn";

export const runtime = "nodejs";

/**
 * One turn of AG Studio's dashboard assistant, run on Tend's own model.
 *
 * AG Studio owns the agent loop in the browser (its agents, its tools, which
 * edit the dashboard); this route is only the model behind it, so the key
 * never reaches the page. It answers same-origin requests only, caps their
 * size and rate, and always uses the model Tend is configured with.
 */

const MAX_BODY = 600_000;
const WINDOW_MS = 10 * 60_000;
const MAX_TURNS = 60;
const turns = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (turns.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  turns.set(ip, recent);
  return recent.length > MAX_TURNS;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return Boolean(origin && host && new URL(origin).host === host);
}

export async function POST(req: Request) {
  if (!aiConfigured()) return NextResponse.json({ error: "No AI model is set up. Add a key on the Setup page." }, { status: 503 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip))
    return NextResponse.json(
      {
        error: "That's a lot of questions at once. Try again in a few minutes.",
      },
      { status: 429 },
    );
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "That conversation is too long. Start a new one." }, { status: 413 });

  let turn: StudioTurn;
  try {
    turn = JSON.parse(raw) as StudioTurn;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const tools: ToolSet = Object.fromEntries(
    (turn.tools ?? []).map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: jsonSchema(t.parameters as Parameters<typeof jsonSchema>[0]),
      }),
    ]),
  );
  const hasTools = Object.keys(tools).length > 0;
  const choice = turn.toolChoice;
  const json = turn.responseFormat?.type === "json" ? turn.responseFormat : null;

  try {
    const result = await generateText({
      model: model(),
      system: [turn.instructions, systemOf(turn.input ?? [])].filter(Boolean).join("\n\n") || undefined,
      messages: toMessages(turn.input ?? []),
      tools: hasTools ? tools : undefined,
      toolChoice: !hasTools ? undefined : typeof choice === "object" ? { type: "tool", toolName: choice.name } : choice,
      output:
        json && !hasTools
          ? Output.object({
              schema: jsonSchema(json.schema as Parameters<typeof jsonSchema>[0]),
              name: json.name,
              description: json.description,
            })
          : undefined,
      maxOutputTokens: 4000,
      maxRetries: 1,
    });
    const text = json && !hasTools && result.output !== undefined ? JSON.stringify(result.output) : result.text;
    return NextResponse.json({
      id: result.response.id || crypto.randomUUID(),
      model: modelId(),
      text,
      toolCalls: result.toolCalls.map((c) => ({
        callId: c.toolCallId,
        name: c.toolName,
        arguments: JSON.stringify(c.input ?? {}),
      })),
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
    });
  } catch (e) {
    console.error("studio ai turn failed", e);
    return NextResponse.json({ error: "The model didn't answer. Try again." }, { status: 502 });
  }
}
