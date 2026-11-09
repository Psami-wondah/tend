import type { ModelMessage } from "ai";

/**
 * AG Studio's dashboard assistant speaks in Responses-style conversation items.
 * Tend's model speaks AI SDK messages. This is the translation, one turn at a time.
 */

export type StudioItem =
  | { type: "message"; role: "user" | "system" | "assistant"; content?: { type: string; text?: string; refusal?: string }[] }
  | { type: "function_call"; callId: string; name: string; arguments: string }
  | { type: "function_call_output"; callId: string; output: string }
  | { type: "reasoning" };

export interface StudioTurn {
  input: StudioItem[];
  instructions?: string;
  tools?: { name: string; description: string; parameters: Record<string, unknown> }[];
  toolChoice?: "auto" | "none" | "required" | { name: string };
  responseFormat?: { type: "text" } | { type: "json"; name: string; description?: string; schema: Record<string, unknown> };
}

function textOf(content: { type: string; text?: string; refusal?: string }[] = []): string {
  return content.map((c) => c.text ?? c.refusal ?? "").join("");
}

/**
 * System items in AG Studio's conversation, joined. The AI SDK takes system
 * text only as instructions, never inside the messages, so the route sends
 * these alongside the turn's own instructions.
 */
export function systemOf(items: StudioItem[]): string {
  return items
    .flatMap((i) => (i.type === "message" && i.role === "system" ? [textOf(i.content)] : []))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The conversation as AI SDK messages. An assistant's text and tool calls in
 * a row become one assistant message, and consecutive tool results one tool
 * message, which is the shape every provider accepts. Reasoning is dropped,
 * and system items go to systemOf.
 */
export function toMessages(items: StudioItem[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  const names = new Map<string, string>();
  for (const item of items) {
    const last = out[out.length - 1];
    if (item.type === "message") {
      const text = textOf(item.content);
      if (!text || item.role === "system") continue;
      if (item.role === "assistant") {
        if (last?.role === "assistant" && Array.isArray(last.content)) last.content.push({ type: "text", text });
        else out.push({ role: "assistant", content: [{ type: "text", text }] });
      } else {
        out.push({ role: "user", content: text });
      }
    } else if (item.type === "function_call") {
      names.set(item.callId, item.name);
      let input: unknown = {};
      try {
        input = JSON.parse(item.arguments || "{}");
      } catch {}
      const part = { type: "tool-call" as const, toolCallId: item.callId, toolName: item.name, input };
      if (last?.role === "assistant" && Array.isArray(last.content)) last.content.push(part);
      else out.push({ role: "assistant", content: [part] });
    } else if (item.type === "function_call_output") {
      const part = { type: "tool-result" as const, toolCallId: item.callId, toolName: names.get(item.callId) ?? "tool", output: { type: "text" as const, value: item.output } };
      if (last?.role === "tool") last.content.push(part);
      else out.push({ role: "tool", content: [part] });
    }
  }
  return out;
}
