import { desc, eq } from "drizzle-orm";
import { generateText, stepCountIs, tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import { getDb, schema } from "../db/client";
import { model } from "./model";
import { CATEGORIES } from "../mandate/types";
import { formatMoney } from "../money";
import {
  activeMandate,
  getCircle,
  getMember,
  getMembers,
  potBalanceMinor,
  reservedMinor,
  spentThisMonthByCategory,
} from "../circle";
import { handleIntake } from "./pipeline";
import { requestShares } from "../contributions";
import { readOnlyPayPalTools } from "../paypal/toolkit";
import { paypalConfigured } from "../paypal/rest";

const { paymentIntents, contributions, auditEvents } = schema;

/**
 * "Ask Tend" — the family's conversational agent.
 *
 * It can look things up (Tend's ledger + read-only PayPal tools from the Agent
 * Toolkit), ask siblings for their share (PayPal invoices), and *propose*
 * payments. A proposal goes through exactly the same mandate engine as
 * anything Mum sends in — the assistant has no way to skip it.
 */
export async function askTend(opts: { memberId: string; messages: ModelMessage[] }) {
  const circle = await getCircle();
  const me = await getMember(opts.memberId);
  if (!me || me.circleId !== circle.id) throw new Error("Unknown member");
  const db = await getDb();
  const money = (m: number) => formatMoney(m, circle.currency);

  const tendTools: ToolSet = {
    care_summary: tool({
      description:
        "Pot balance, money reserved for in-flight payments, what each family member has contributed, spend by category this month, and payments waiting for approval.",
      inputSchema: z.object({}),
      execute: async () => {
        const members = await getMembers(circle.id);
        const contribs = await db.select().from(contributions).where(eq(contributions.circleId, circle.id));
        const byMember = members.map((m) => ({
          name: m.name,
          role: m.role,
          contributed: money(
            contribs.filter((c) => c.memberId === m.id && c.status === "completed").reduce((a, c) => a + c.amountMinor, 0),
          ),
          pendingInvoices: contribs.filter((c) => c.memberId === m.id && c.status === "pending").length,
        }));
        const intents = await db
          .select()
          .from(paymentIntents)
          .where(eq(paymentIntents.circleId, circle.id))
          .orderBy(desc(paymentIntents.createdAt))
          .limit(50);
        const spent = await spentThisMonthByCategory(circle.id);
        return {
          careRecipient: circle.careRecipientName,
          potBalance: money(await potBalanceMinor(circle.id)),
          reserved: money(await reservedMinor(circle.id)),
          members: byMember,
          spentThisMonth: Object.fromEntries(Object.entries(spent).map(([k, v]) => [k, money(v)])),
          awaitingApproval: intents
            .filter((i) => i.status === "awaiting_approval" || i.status === "on_hold")
            .map((i) => ({ id: i.id, payee: i.payeeName, amount: money(i.amountMinor), status: i.status, summary: i.summary })),
        };
      },
    }),

    recent_payments: tool({
      description: "Recent payments Tend handled, newest first, with status and the mandate decision.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(15) }),
      execute: async ({ limit }) => {
        const rows = await db
          .select()
          .from(paymentIntents)
          .where(eq(paymentIntents.circleId, circle.id))
          .orderBy(desc(paymentIntents.createdAt))
          .limit(limit);
        return rows.map((r) => ({
          id: r.id,
          when: r.createdAt.toISOString(),
          payee: r.payeeName,
          amount: money(r.amountMinor),
          category: r.category,
          status: r.status,
          decision: r.decision,
          summary: r.summary,
          paypalTransactionId: r.paypalTransactionId,
        }));
      },
    }),

    explain_payment: tool({
      description: "Explain why Tend made a decision about one payment: the mandate rules that fired and the full audit trail.",
      inputSchema: z.object({ paymentId: z.string() }),
      execute: async ({ paymentId }) => {
        const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, paymentId));
        if (!intent || intent.circleId !== circle.id) return { error: "Not found" };
        const trail = await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.intentId, paymentId))
          .orderBy(auditEvents.createdAt);
        return {
          payee: intent.payeeName,
          amount: money(intent.amountMinor),
          status: intent.status,
          reasons: intent.evaluation.reasons,
          trail: trail.map((t) => ({ at: t.createdAt.toISOString(), actor: t.actor, type: t.type })),
        };
      },
    }),

    current_mandate: tool({
      description: "The family's current spending rules (auto-pay limits, approval thresholds, blocked methods).",
      inputSchema: z.object({}),
      execute: async () => activeMandate(circle.id),
    }),

    propose_payment: tool({
      description:
        "Propose a payment from the care pot to a payee. It is checked against the family's mandate: it may be paid, sent for approval, held, or refused. Only use when the family member clearly asks to pay something.",
      inputSchema: z.object({
        payeeName: z.string(),
        amount: z.number().positive().describe("Major units, e.g. 45.00"),
        category: z.enum(CATEGORIES),
        reference: z.string().nullable(),
        summary: z.string().describe("Short plain-English description, e.g. 'Mum's taxi to the eye clinic'"),
      }),
      execute: async (p) => {
        const result = await handleIntake({
          source: "text",
          submittedBy: me.id,
          text: `${me.name} asked Tend: pay ${p.payeeName} ${p.amount} for ${p.summary}`,
          preExtracted: {
            kind: "payment_request",
            isPaymentRequest: true,
            payeeName: p.payeeName,
            payeeEmail: null,
            amount: p.amount,
            currency: circle.currency,
            category: p.category,
            method: "paypal",
            reference: p.reference,
            dueDate: null,
            summary: p.summary,
            scam: {
              impersonation: false,
              urgency: false,
              secrecy: false,
              unusualMethod: false,
              unsolicited: false,
              riskScore: 0,
              explanation: `Requested by ${me.name}, a family member.`,
            },
            confidence: 1,
          },
        });
        return {
          outcome: result.outcome,
          message: result.message,
          reasons: result.evaluation?.reasons.map((r) => r.message),
          paymentId: result.intent?.id,
        };
      },
    }),

    request_shares: tool({
      description:
        "Ask every family member to pay their equal share of an amount into the care pot, by sending each a PayPal invoice.",
      inputSchema: z.object({
        total: z.number().positive().describe("Total to raise across the family, major units"),
        note: z.string().describe("What it's for, e.g. 'November carer hours'"),
      }),
      execute: async ({ total, note }) => requestShares(Math.round(total * 100), note),
    }),
  };

  const tools: ToolSet = paypalConfigured() ? { ...tendTools, ...readOnlyPayPalTools() } : tendTools;

  const result = await generateText({
    model: model(),
    system: `You are Tend, the care-money agent for ${circle.careRecipientName}'s family.
You're talking to ${me.name} (${me.role}). Today is ${new Date().toISOString().slice(0, 10)}. Currency: ${circle.currency}.

- Be brief, warm and concrete. Use names and amounts.
- Use tools for facts; never guess balances or statuses.
- PayPal tools (list_transactions, get_invoice, list_disputes…) read the care pot's real PayPal account.
- You can't move money directly. propose_payment runs the family's mandate, which decides.
- Never give medical advice. You handle money for care, not care decisions.
- If something looks wrong (duplicate charge, an unknown payee, a dispute), say so plainly.`,
    messages: opts.messages,
    tools,
    stopWhen: stepCountIs(8),
  });

  return {
    text: result.text,
    toolCalls: result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
  };
}
