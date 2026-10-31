import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { tool, type ToolSet } from "ai";

/**
 * PayPal Agent Toolkit, scoped for Tend.
 *
 * The toolkit is built on AI SDK v4 tool objects; Tend uses AI SDK v7. Its
 * tool parameters are Zod schemas that implement Standard Schema, so we
 * re-wrap each one with v7's `tool()` and keep PayPal's own execute().
 *
 * Crucially, the *model* only ever sees READ_ONLY_TOOLS. Tools that move money
 * (create_invoice, send_invoice, create_refund…) are called by Tend's server
 * code after the mandate engine and the family have said yes — never directly
 * by the model.
 */

const ACTIONS = {
  invoices: { create: true, list: true, get: true, send: true, sendReminder: true, cancel: true },
  orders: { create: true, get: true },
  payments: { createRefund: true, getRefund: true },
  transactions: { list: true },
  disputes: { list: true, get: true },
};

export const READ_ONLY_TOOLS = [
  "list_invoices",
  "get_invoice",
  "get_order",
  "list_transactions",
  "list_disputes",
  "get_dispute",
] as const;

type V4Tool = {
  description?: string;
  parameters: unknown;
  execute: (args: unknown, options?: unknown) => Promise<unknown>;
};

const g = globalThis as unknown as { __tendToolkit?: PayPalAgentToolkit };

function toolkit(): PayPalAgentToolkit {
  if (!g.__tendToolkit) {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("PayPal credentials missing");
    g.__tendToolkit = new PayPalAgentToolkit({
      clientId,
      clientSecret,
      configuration: {
        actions: ACTIONS,
        context: { sandbox: process.env.PAYPAL_ENV !== "live" },
      },
    });
  }
  return g.__tendToolkit;
}

function rawTools(): Record<string, V4Tool> {
  return toolkit().getTools() as unknown as Record<string, V4Tool>;
}

/** Read-only PayPal tools, in AI SDK v7 shape, safe to hand to the model. */
export function readOnlyPayPalTools(): ToolSet {
  const all = rawTools();
  const out: ToolSet = {};
  for (const name of READ_ONLY_TOOLS) {
    const t = all[name];
    if (!t) continue;
    out[name] = tool({
      description: t.description ?? name,
      // Zod v3 schemas implement Standard Schema, which v7 accepts.
      inputSchema: t.parameters as never,
      execute: async (args: unknown) => t.execute(args),
    });
  }
  return out;
}

/** Server-side invocation of a toolkit tool (used after mandate + approvals). */
export async function runPayPalTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const t = rawTools()[name];
  if (!t) throw new Error(`PayPal tool ${name} is not enabled`);
  const result = await t.execute(args);
  // The toolkit returns JSON strings for most tools.
  if (typeof result === "string") {
    try {
      return JSON.parse(result) as T;
    } catch {
      return result as T;
    }
  }
  return result as T;
}
