import { desc, eq } from "drizzle-orm";
import { generateText, stepCountIs, tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import { getDb, schema } from "../db/client";
import { model, aiConfigured } from "./model";
import { CATEGORIES, type Category } from "../mandate/types";
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
import { paypalMode } from "../paypal/rest";
import { scanForDuplicates, listRecoveries } from "../recoveries";
import { proposeRuleChange } from "../rules";
import { localTime, isAwake } from "../time";
import { stopOwnPayment } from "../own-payments";
import { and, inArray } from "drizzle-orm";
import { findAmount } from "./offline";
import { shopFor, type ShopResult } from "../shopping";
import type { Circle, Member } from "../db/schema";

const { paymentIntents, contributions, auditEvents } = schema;

/** Things the chat can show as cards under Tend's reply. */
export type AskCard =
  | { type: "payment"; paymentId: string; outcome: string; payee: string; amountMinor: number }
  | { type: "shares"; shareMinor: number; count: number; simulated: boolean }
  | { type: "duplicates"; found: number; open: number }
  | { type: "rules"; ask: string; summary: string }
  | ({ type: "products"; maxPrice: number | null } & ShopResult);

export interface AskResult {
  text: string;
  toolCalls: string[];
  cards: AskCard[];
  offline: boolean;
}

/**
 * Tend's own actions. The Claude agent gets them as tools; demo mode without
 * a key calls them from a simple router. Neither path can move money except
 * through propose_payment, which runs the family's mandate.
 */
function actions(circle: Circle, me: Member) {
  const money = (m: number) => formatMoney(m, circle.currency);
  return {
    async careSummary() {
      const db = await getDb();
      const members = await getMembers(circle.id);
      const contribs = await db.select().from(contributions).where(eq(contributions.circleId, circle.id));
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
        members: members.map((m) => ({
          name: m.name,
          role: m.role,
          city: m.city,
          contributed: money(contribs.filter((c) => c.memberId === m.id && c.status === "completed").reduce((a, c) => a + c.amountMinor, 0)),
          pendingInvoices: contribs.filter((c) => c.memberId === m.id && c.status === "pending").length,
        })),
        spentThisMonth: Object.fromEntries(Object.entries(spent).map(([k, v]) => [k, money(v)])),
        awaitingApproval: intents
          .filter((i) => i.status === "awaiting_approval" || i.status === "on_hold")
          .map((i) => ({ id: i.id, payee: i.payeeName, amount: money(i.amountMinor), status: i.status, summary: i.summary })),
      };
    },

    async recentPayments(limit = 15) {
      const db = await getDb();
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
        reference: r.reference,
        status: r.status,
        decision: r.decision,
        summary: r.summary,
        paypalTransactionId: r.paypalTransactionId,
      }));
    },

    async explainPayment(paymentId: string) {
      const db = await getDb();
      const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, paymentId));
      if (!intent || intent.circleId !== circle.id) return { error: "Not found" };
      const trail = await db.select().from(auditEvents).where(eq(auditEvents.intentId, paymentId)).orderBy(auditEvents.createdAt);
      return {
        payee: intent.payeeName,
        amount: money(intent.amountMinor),
        status: intent.status,
        reasons: intent.evaluation.reasons,
        trail: trail.map((t) => ({ at: t.createdAt.toISOString(), actor: t.actor, type: t.type })),
      };
    },

    async familyClocks() {
      const members = await getMembers(circle.id);
      return members.map((m) => ({ name: m.name, role: m.role, city: m.city, localTime: localTime(m.timezone).label, awake: isAwake(m.timezone) }));
    },

    async proposePayment(p: { payeeName: string; amount: number; category: Category; reference: string | null; summary: string }) {
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
        payee: result.intent?.payeeName ?? p.payeeName,
        amountMinor: result.intent?.amountMinor ?? Math.round(p.amount * 100),
      };
    },

    async requestShares(total: number, note: string) {
      return requestShares(Math.round(total * 100), note);
    },

    async findDuplicateCharges() {
      const found = await scanForDuplicates();
      const open = await listRecoveries(circle.id);
      const settled = await listRecoveries(circle.id, ["recovered"]);
      return {
        newlyFound: found.length,
        open: open.map((r) => ({ payee: r.payeeName, amount: money(r.amountMinor), status: r.status, recoveryId: r.id })),
        alreadyRecovered: settled.map((r) => ({ payee: r.payeeName, amount: money(r.amountMinor) })),
      };
    },

    async shop(need: string, maxPrice: number | null) {
      return shopFor(need, maxPrice, circle.currency);
    },

    async ownPayments() {
      const db = await getDb();
      const rows = await db
        .select()
        .from(paymentIntents)
        .where(and(eq(paymentIntents.circleId, circle.id), eq(paymentIntents.funding, "own"), inArray(paymentIntents.status, ["held", "paid", "voided", "refused"])))
        .orderBy(desc(paymentIntents.createdAt))
        .limit(20);
      return rows.map((r) => ({
        paymentId: r.id,
        when: r.createdAt.toISOString(),
        payee: r.payeeName,
        amount: money(r.amountMinor),
        status: r.status === "voided" ? "stopped" : r.status,
        heldUntil: r.holdUntil?.toISOString() ?? null,
        /** In the asker's own time zone, ready to say. */
        heldUntilLocal: r.holdUntil
          ? `${r.holdUntil.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: me.timezone ?? "UTC" })} your time`
          : null,
        why: r.evaluation.reasons[0]?.message ?? null,
      }));
    },

    async stopHeld(paymentId: string, note: string | null) {
      const r = await stopOwnPayment(paymentId, me.id, note ?? undefined);
      return { status: r.status === "voided" ? "stopped" : r.status, payee: r.payeeName, amount: money(r.amountMinor) };
    },

    async proposeRuleChange(request: string) {
      const p = await proposeRuleChange(request);
      return { understood: p.understood, reply: p.reply, changes: p.changes.map((c) => `${c.label}: ${c.display}`), problems: p.problems };
    },
  };
}

export async function askTend(opts: { memberId: string; messages: ModelMessage[] }): Promise<AskResult> {
  const circle = await getCircle();
  const me = await getMember(opts.memberId);
  if (!me || me.circleId !== circle.id) throw new Error("Unknown member");
  const act = actions(circle, me);
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user");
  const lastText = typeof lastUser?.content === "string" ? lastUser.content : "";
  if (!aiConfigured()) return askOffline(act, circle, lastText);

  const tendTools: ToolSet = {
    care_summary: tool({
      description:
        "Pot balance, money reserved for in-flight payments, what each family member has contributed, spend by category this month, and payments waiting for approval.",
      inputSchema: z.object({}),
      execute: () => act.careSummary(),
    }),
    recent_payments: tool({
      description: "Recent payments Tend handled, newest first, with status, reference and the mandate decision.",
      inputSchema: z.object({ limit: z.number().int().min(1).max(50).default(15) }),
      execute: ({ limit }) => act.recentPayments(limit),
    }),
    explain_payment: tool({
      description: "Explain why Tend made a decision about one payment: the mandate rules that fired and the full audit trail.",
      inputSchema: z.object({ paymentId: z.string() }),
      execute: ({ paymentId }) => act.explainPayment(paymentId),
    }),
    current_mandate: tool({
      description: "The family's current spending rules (auto-pay limits, approval thresholds, blocked methods).",
      inputSchema: z.object({}),
      execute: () => activeMandate(circle.id),
    }),
    family_clocks: tool({
      description: "Each family member's city, local time, and whether they're likely awake. The family lives in different time zones.",
      inputSchema: z.object({}),
      execute: () => act.familyClocks(),
    }),
    find_duplicate_charges: tool({
      description:
        "Scan the last 60 days of payouts for bills paid twice (same payee, amount and reference). Newly found ones appear on the family's home screen, where a family member can ask the payee for a refund with one tap.",
      inputSchema: z.object({}),
      execute: () => act.findDuplicateCharges(),
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
      execute: (p) => act.proposePayment(p),
    }),
    request_shares: tool({
      description: "Ask every family member to pay their equal share of an amount into the care pot, by sending each a PayPal invoice.",
      inputSchema: z.object({
        total: z.number().positive().describe("Total to raise across the family, major units"),
        note: z.string().describe("What it's for, e.g. 'November carer hours'"),
      }),
      execute: ({ total, note }) => act.requestShares(total, note),
    }),
    shop_for_mum: tool({
      description:
        "Search real retailers (Channel3 product search) for something Mum needs, e.g. a shower chair or a pill organiser, and recommend the best in-stock option within budget. Shows the family up to three options with a Buy button. Buying still goes through the mandate and needs a family member's OK.",
      inputSchema: z.object({
        need: z.string().describe("What to look for, in shopping terms, e.g. 'folding shower chair with backrest'"),
        maxPrice: z.number().positive().nullable().describe("Budget in dollars, or null"),
      }),
      execute: async ({ need, maxPrice }) => {
        const r = await act.shop(need, maxPrice);
        return { ...r, maxPrice };
      },
    }),
    own_payments: tool({
      description: `Payments ${circle.careRecipientName} made from their own PayPal: held right now (cooling-off), paid, stopped by the circle, or refused as scams.`,
      inputSchema: z.object({}),
      execute: () => act.ownPayments(),
    }),
    stop_held_payment: tool({
      description:
        "Stop a payment that is being held in their own PayPal. This voids the PayPal authorization so the money never leaves. Only use when the family member clearly asks to stop it.",
      inputSchema: z.object({ paymentId: z.string(), note: z.string().nullable().describe("Why, in the family member's words") }),
      execute: ({ paymentId, note }) => act.stopHeld(paymentId, note),
    }),
    propose_rule_change: tool({
      description:
        "Turn a request to change the family's spending rules into a proposed change. Nothing changes until a family member reviews and saves it on the Rules page.",
      inputSchema: z.object({ request: z.string().describe("The change in the family member's words") }),
      execute: ({ request }) => act.proposeRuleChange(request),
    }),
  };

  const live = paypalMode() !== "simulated";
  const tools: ToolSet = live ? { ...tendTools, ...readOnlyPayPalTools() } : tendTools;

  const result = await generateText({
    model: model(),
    system: `You are Tend, the money guardian for ${circle.careRecipientName} and the people they trust (their circle). ${circle.story ?? ""} ${circle.potEnabled ? "The circle shares a care pot." : `There's no shared pot: ${circle.careRecipientName} pays from their own PayPal, and Tend holds unusual payments so the circle can look.`}
You're talking to ${me.name} (${me.role}, in ${me.city ?? "an unknown city"}). Today is ${new Date().toISOString().slice(0, 10)}. Currency: ${circle.currency}.

- Be brief, warm and concrete. Use names and amounts. Plain text, no markdown headings or tables.
- Use tools for facts; never guess balances or statuses.
- ${live ? "PayPal tools (list_transactions, get_invoice, list_disputes…) read the care pot's real PayPal sandbox account." : "PayPal is in demo mode (simulated), so there are no PayPal account tools; Tend's own ledger is the record."}
- You can't move money directly. propose_payment runs the family's mandate, which decides. Rule changes are only proposals until someone saves them.
- If asked about double charges, run find_duplicate_charges and say what to do next.
- Payments from their own PayPal that look unusual are authorized but held (cooling-off). Use own_payments to see them; stop_held_payment voids one when asked.
- To buy something for Mum, use shop_for_mum; the family picks and taps Buy, and the purchase still needs their OK.
- Never give medical advice. You handle money for care, not care decisions.
- If something looks wrong (duplicate charge, an unknown payee, a dispute), say so plainly.`,
    messages: opts.messages,
    tools,
    stopWhen: stepCountIs(8),
  });

  const cards: AskCard[] = [];
  for (const step of result.steps) {
    for (const r of step.toolResults) cards.push(...cardsFor(r.toolName, r.input, r.output, lastText));
  }
  return { text: result.text, toolCalls: result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)), cards, offline: false };
}

function cardsFor(name: string, input: unknown, output: unknown, ask: string): AskCard[] {
  const o = output as Record<string, unknown> | undefined;
  if (!o) return [];
  if (name === "propose_payment" && typeof o.paymentId === "string") {
    return [{ type: "payment", paymentId: o.paymentId, outcome: String(o.outcome), payee: String(o.payee), amountMinor: Number(o.amountMinor) }];
  }
  if (name === "request_shares" && typeof o.share === "number") {
    const results = (o.results as { error?: string; invoiceId?: string }[]) ?? [];
    return [{ type: "shares", shareMinor: o.share, count: results.filter((r) => !r.error).length, simulated: results.some((r) => r.invoiceId?.startsWith("SIM-")) }];
  }
  if (name === "find_duplicate_charges") {
    return [{ type: "duplicates", found: Number(o.newlyFound ?? 0), open: Array.isArray(o.open) ? o.open.length : 0 }];
  }
  if (name === "shop_for_mum" && Array.isArray(o.products)) {
    return [{ type: "products", ...(o as unknown as ShopResult), maxPrice: (o.maxPrice as number | null) ?? null }];
  }
  if (name === "propose_rule_change" && o.understood) {
    const req = (input as { request?: string })?.request ?? ask;
    return [{ type: "rules", ask: req, summary: ((o.changes as string[]) ?? []).join(" · ") }];
  }
  return [];
}

// --- Demo mode: no Anthropic key ------------------------------------------------

async function askOffline(act: ReturnType<typeof actions>, circle: Circle, text: string): Promise<AskResult> {
  const t = text.toLowerCase();
  const money = (m: number) => formatMoney(m, circle.currency);
  const done = (reply: string, toolCalls: string[], cards: AskCard[] = []): AskResult => ({ text: reply, toolCalls, cards, offline: true });

  if (/held|hold|paused|stop/.test(t)) {
    const own = await act.ownPayments();
    const held = own.filter((o) => o.status === "held");
    if (/stop/.test(t) && held.length) {
      const target = held.find((h) => t.includes(h.payee.toLowerCase().split(" ")[0])) ?? held[0];
      const r = await act.stopHeld(target.paymentId, text);
      return done(`Stopped. PayPal voided the hold on ${r.amount} to ${r.payee}, so the money never left ${circle.careRecipientName}'s account.`, ["own_payments", "stop_held_payment"]);
    }
    if (!held.length) {
      const stopped = own.filter((o) => o.status === "stopped" || o.status === "refused");
      return done(
        `Nothing is held right now.${stopped.length ? ` This month the circle stopped or Tend refused ${stopped.length} payment${stopped.length > 1 ? "s" : ""}: ${stopped.map((s) => `${s.amount} to ${s.payee}`).join(", ")}.` : ""}`,
        ["own_payments"],
      );
    }
    return done(held.map((h) => `${h.amount} to ${h.payee} is held${h.heldUntilLocal ? ` until ${h.heldUntilLocal}` : ""}. ${h.why ?? ""}`).join(" ") + " Say \"stop it\" to cancel.", ["own_payments"]);
  }

  if (/twice|double|duplicate|charged us/.test(t)) {
    const r = await act.findDuplicateCharges();
    if (!r.open.length) {
      const back = r.alreadyRecovered[0];
      return done(
        back
          ? `Nothing outstanding. ${back.payee} was paid ${back.amount} twice recently, and they've already paid it back into the pot.`
          : "I checked the last 60 days of payments and found nothing paid twice.",
        ["find_duplicate_charges"],
      );
    }
    const first = r.open[0];
    return done(
      `Yes. ${first.payee} was paid ${first.amount} twice for the same bill. ${first.status === "found" ? "You can ask them for it back from the home screen; Tend will send them a PayPal refund invoice." : "Tend has already asked them for it back."}`,
      ["find_duplicate_charges"],
      [{ type: "duplicates", found: r.newlyFound, open: r.open.length }],
    );
  }

  const share = t.match(/share|chip in|everyone/);
  const amount = findAmount(text);
  if (share && amount) {
    const note = text.match(/.*\bfor (.+)$/i)?.[1]?.replace(/[.?!]$/, "") ?? "Mum's care";
    const r = await act.requestShares(amount, note);
    const ok = r.results.filter((x) => !x.error).length;
    return done(
      `Done. I've sent ${ok} PayPal invoices of ${money(r.share)} each for ${note}.`,
      ["request_shares"],
      [{ type: "shares", shareMinor: r.share, count: ok, simulated: r.results.some((x) => x.invoiceId?.startsWith("SIM-")) }],
    );
  }

  const pay = text.match(/^\s*pay\s+(.+?)\s+\$?(\d+(?:\.\d{1,2})?)\s*(?:for\s+(.+))?$/i);
  if (pay) {
    const category = (CATEGORIES.find((c) => new RegExp(c, "i").test(text)) ??
      (/taxi|cab/i.test(text) ? "transport" : /pharm|tablet|prescription/i.test(text) ? "pharmacy" : /carer|care visit/i.test(text) ? "carer" : "other")) as Category;
    const r = await act.proposePayment({ payeeName: pay[1], amount: Number(pay[2]), category, reference: null, summary: pay[3]?.replace(/[.?!]$/, "") ?? `Payment to ${pay[1]}` });
    return done(r.message, ["propose_payment"], r.paymentId ? [{ type: "payment", paymentId: r.paymentId, outcome: r.outcome, payee: r.payee, amountMinor: r.amountMinor }] : []);
  }

  const shopping = text.match(/\b(?:find|buy|get|order|shop for|looking for)\s+(?:mum\s+|her\s+)?(?:an?\s+)?(.+?)(?:\s+(?:for mum|for her))?(?:\s+(?:under|below|less than)\s+\$?(\d+(?:\.\d+)?))?[.?!]?$/i);
  if (shopping && !/\b(share|chip in)\b/i.test(text)) {
    const maxPrice = shopping[2] ? Number(shopping[2]) : null;
    const r = await act.shop(shopping[1].replace(/\bfor (mum|her)\b/i, "").trim(), maxPrice);
    const pick = r.products.find((p) => p.id === r.pick?.productId);
    return done(
      pick
        ? `I found ${r.products.length} option${r.products.length > 1 ? "s" : ""}${r.source === "sample" ? " in the sample catalogue (demo mode)" : ""}. I'd pick the ${pick.title.toLowerCase()} at ${money(pick.best.priceMinor)} from ${pick.best.domain}. ${r.pick?.why} Tap Buy to send it to the family for an OK.`
        : `I couldn't find anything in stock for that${maxPrice ? ` under ${money(maxPrice * 100)}` : ""}.`,
      ["shop_for_mum"],
      r.products.length ? [{ type: "products", ...r, maxPrice }] : [],
    );
  }

  if (/auto-?pay|budget|rule|approval|block|allow/.test(t)) {
    const r = await act.proposeRuleChange(text);
    if (r.understood) return done(`${r.reply} ${r.changes.join(" · ")}`, ["propose_rule_change"], [{ type: "rules", ask: text, summary: r.changes.join(" · ") }]);
  }

  if (/awake|time|asleep|where/.test(t)) {
    const clocks = await act.familyClocks();
    return done(clocks.map((c) => `${c.name}: ${c.localTime} in ${c.city}${c.awake ? "" : " (probably asleep)"}`).join(". ") + ".", ["family_clocks"]);
  }

  const s = await act.careSummary();
  const waiting = s.awaitingApproval.length ? ` ${s.awaitingApproval.length} payment${s.awaitingApproval.length > 1 ? "s are" : " is"} waiting for the family.` : "";
  const contributed = s.members.filter((m) => m.role === "owner" || m.role === "sibling").map((m) => `${m.name} ${m.contributed}`).join(", ");
  return done(
    `The pot has ${s.potBalance}${s.reserved !== money(0) ? ` (${s.reserved} set aside for payments going out)` : ""}. So far: ${contributed}.${waiting} I'm answering from the ledger without AI; connect Claude for open questions.`,
    ["care_summary"],
  );
}
