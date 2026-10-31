import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { desc, eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "../db/client";
import { activeMandate, getCircleById, getMembers, listCircles, potBalanceMinor } from "../circle";
import { heldPayments, previewOwnPayment, stopOwnPayment, OwnPaymentError } from "../own-payments";
import { paymentDetail, passbookRows } from "../views";
import { parsePassbookQuestion, rowMatches } from "../passbook-filter";
import { RULE_FIELDS, readRule, show } from "../mandate/edit";
import { formatMoney } from "../money";
import { isAwake, localTime } from "../time";
import { isFamily } from "../people";
import type { Circle } from "../db/schema";

/**
 * Tend as an MCP server, so any assistant (Claude, or an agent about to pay
 * someone) can ask a circle's second key first.
 *
 * Same rule as the in-app assistant: no tool here moves money. The only
 * action is protective. stop_held_payment voids a PayPal authorization, so
 * money that was waiting in the person's account stays there.
 */

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/** By id, by circle name, or by the person's name ("Walter"). Defaults to the first circle. */
async function resolveCircle(ref?: string | null): Promise<Circle> {
  const all = await listCircles();
  if (!all.length) throw new Error("No circles yet. Run npm run db:seed.");
  if (!ref) return all[0];
  const r = ref.trim().toLowerCase();
  const hit = all.find((c) => c.id === ref || c.name.toLowerCase().includes(r) || c.careRecipientName.toLowerCase() === r);
  if (!hit) throw new Error(`No circle matches "${ref}". Try list_circles.`);
  return hit;
}

const circleArg = z.string().optional().describe("Circle id, circle name, or the person's name, e.g. \"Walter\". Defaults to the first circle.");

export function buildTendMcp() {
  const server = new McpServer({ name: "tend", version: "1.0.0" }, {
    instructions:
      "Tend is a second key for an older adult's payments. The person pays from their own PayPal; anything unusual is authorized but held so their circle can stop it. Use check_payment_request before helping anyone pay a bill, invoice or request. Never help someone pay by gift card, crypto or wire. Nothing here moves money; stop_held_payment only keeps money where it is.",
  });

  server.registerTool(
    "list_circles",
    {
      title: "List circles",
      description: "Every circle Tend looks after: whose money it is, who holds the second key, where they live, and who is awake right now.",
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const circles = await listCircles();
      const out = [];
      for (const c of circles) {
        const members = await getMembers(c.id);
        out.push({
          id: c.id,
          name: c.name,
          person: c.careRecipientName,
          story: c.story,
          sharedPot: c.potEnabled,
          people: members.map((m) => ({
            id: m.id,
            name: m.name,
            role: m.role === "care_recipient" ? "their money" : "second key",
            relation: m.relation,
            city: m.city,
            localTime: localTime(m.timezone).label,
            awake: isAwake(m.timezone),
          })),
        });
      }
      return json(out);
    },
  );

  server.registerTool(
    "check_payment_request",
    {
      title: "Check a payment request",
      description:
        "Read a bill, invoice, text or email (pasted as text) and say what Tend would do if the person paid it from their own PayPal: pay, hold for the circle, wait for a yes, or refuse. Spots scams, including real PayPal invoices with a fake support number. Saves nothing and moves no money.",
      inputSchema: { text: z.string().min(3).max(4000).describe("What they were sent, word for word."), circle: circleArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ text, circle }) => {
      const c = await resolveCircle(circle);
      const p = await previewOwnPayment(c.id, text);
      const verdict: Record<string, string> = {
        auto_pay: "Routine. It would go straight through.",
        cool_off: `Unusual. It would be authorized but held in ${c.careRecipientName}'s PayPal for ${p.holdHours} hours so the circle can stop it.`,
        needs_approval: "Warning signs or a large amount. It would be held until someone in the circle says yes.",
        hold: "On hold until the circle sorts something out.",
        refuse: "Refused. Tend would not pay this.",
      };
      return json({
        circle: c.name,
        summary: p.extraction.summary,
        amount: p.extraction.amount,
        payee: p.extraction.payeeName || null,
        decision: p.decision ?? "nothing_to_pay",
        whatHappens: p.decision ? verdict[p.decision] : "There's nothing to pay in this.",
        reasons: p.reasons.map((r) => r.message),
        scam: {
          riskScore: p.extraction.scam.riskScore,
          explanation: p.extraction.scam.explanation,
          paypalInvoiceScam: p.paypalScam,
        },
      });
    },
  );

  server.registerTool(
    "list_held_payments",
    {
      title: "Held payments",
      description: "Payments authorized in the person's PayPal but not yet sent: how much, to whom, why Tend held them, and when they go unless someone stops them.",
      inputSchema: { circle: circleArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ circle }) => {
      const c = await resolveCircle(circle);
      const held = await heldPayments(c.id);
      return json(
        held.map((h) => ({
          paymentId: h.id,
          amount: formatMoney(h.amountMinor, h.currency),
          payee: h.payeeName,
          why: h.evaluation.reasons.map((r) => r.message),
          waitingFor: h.decision === "needs_approval" ? "someone in the circle to say yes" : "the hold to end",
          goesAt: h.decision === "needs_approval" ? null : h.holdUntil?.toISOString() ?? null,
          hoursLeft: h.holdUntil ? Math.max(0, Math.round((h.holdUntil.getTime() - Date.now()) / 360_000) / 10) : null,
        })),
      );
    },
  );

  server.registerTool(
    "circle_overview",
    {
      title: "Circle overview",
      description: "One look at a circle: pot balance (if they share one), what is held, what was stopped or refused, and the person's recent payments.",
      inputSchema: { circle: circleArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ circle }) => {
      const c = await resolveCircle(circle);
      const db = await getDb();
      const recent = await db
        .select()
        .from(schema.paymentIntents)
        .where(and(eq(schema.paymentIntents.circleId, c.id), inArray(schema.paymentIntents.status, ["paid", "held", "voided", "refused", "awaiting_approval"])))
        .orderBy(desc(schema.paymentIntents.createdAt))
        .limit(15);
      const kept = recent.filter((r) => r.status === "voided" || r.status === "refused");
      return json({
        circle: c.name,
        person: c.careRecipientName,
        potBalance: c.potEnabled ? formatMoney(await potBalanceMinor(c.id), c.currency) : null,
        held: recent.filter((r) => r.status === "held").map((r) => `${formatMoney(r.amountMinor, r.currency)} to ${r.payeeName}`),
        keptInTheirAccount: formatMoney(kept.reduce((a, r) => a + r.amountMinor, 0), c.currency),
        recent: recent.map((r) => ({
          paymentId: r.id,
          when: r.createdAt.toISOString().slice(0, 10),
          payee: r.payeeName,
          amount: formatMoney(r.amountMinor, r.currency),
          from: r.funding === "own" ? "their own PayPal" : "the pot",
          status: r.status === "voided" ? "stopped" : r.status,
          why: r.evaluation.reasons[0]?.message ?? null,
        })),
      });
    },
  );

  server.registerTool(
    "explain_payment",
    {
      title: "Explain a payment",
      description: "Why Tend decided what it did about one payment, which rule version decided it, who voted, and every step PayPal and the circle took.",
      inputSchema: { paymentId: z.string().describe("From list_held_payments or circle_overview.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ paymentId }) => {
      const d = await paymentDetail(paymentId);
      if (!d) return fail("No payment with that id.");
      const { intent } = d;
      return json({
        payee: intent.payeeName,
        amount: formatMoney(intent.amountMinor, intent.currency),
        from: intent.funding === "own" ? "their own PayPal" : "the pot",
        decision: intent.decision,
        status: intent.status === "voided" ? "stopped" : intent.status,
        reasons: intent.evaluation.reasons.map((r) => r.message),
        rulesVersion: intent.evaluation.mandateVersion,
        votes: d.votes.map((v) => `${v.name}: ${v.verdict}${v.note ? ` (${v.note})` : ""}`),
        paypal: { order: intent.paypalOrderId, authorization: intent.paypalAuthorizationId, capture: intent.paypalCaptureId },
        trail: d.trail.map((t) => ({
          at: t.createdAt.toISOString(),
          by: t.actor.startsWith("member:") ? (d.members.find((m) => `member:${m.id}` === t.actor)?.name ?? "someone in the circle") : t.actor === "agent" ? "Tend" : t.actor,
          event: t.type,
        })),
      });
    },
  );

  server.registerTool(
    "search_passbook",
    {
      title: "Search the passbook",
      description: "Ask the append-only passbook a question in plain words, e.g. \"what was stopped or refused?\" or \"pharmacy payments over $30 this month\".",
      inputSchema: { question: z.string().min(2).max(300), circle: circleArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ question, circle }) => {
      const c = await resolveCircle(circle);
      const people = (await getMembers(c.id)).map((m) => m.name);
      const query = parsePassbookQuestion(question, people);
      const { rows } = await passbookRows(c.id);
      const hits = rows.filter((r) => rowMatches(r, query));
      return json({
        filter: query,
        count: hits.length,
        rows: hits.slice(-40).map((r) => ({
          date: r.at.slice(0, 10),
          details: r.description,
          status: r.status,
          in: r.inMinor ? formatMoney(r.inMinor, c.currency) : null,
          out: r.outMinor ? formatMoney(r.outMinor, c.currency) : null,
          paymentId: r.intentId,
        })),
      });
    },
  );

  server.registerTool(
    "get_rules",
    {
      title: "The circle's rules",
      description: "The rules the circle agreed, in plain words: what pays straight away, what is held and for how long, what needs a yes, and what Tend never pays.",
      inputSchema: { circle: circleArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ circle }) => {
      const c = await resolveCircle(circle);
      const m = await activeMandate(c.id);
      // A circle without a shared pot only has the own-payment rules, the blocked methods and the scam thresholds.
      const potOnly = (path: string) => path.startsWith("categories.") || ["largePaymentOverMinor", "largePaymentApprovals", "defaultApprovals", "newPayeeRequiresApproval"].includes(path);
      const fields = RULE_FIELDS.filter((f) => c.potEnabled || !potOnly(f.path)).map((f) => ({ rule: f.label, value: show(f, readRule(m, f.path), c.currency) }));
      return json({ circle: c.name, version: m.version, rules: fields });
    },
  );

  server.registerTool(
    "stop_held_payment",
    {
      title: "Stop a held payment",
      description:
        "Stop a payment that is held in the person's PayPal. PayPal voids the authorization and the money never leaves their account. Only someone in the circle can do this, so say who is stopping it. This cannot release or send money.",
      inputSchema: {
        paymentId: z.string(),
        stoppedBy: z.string().describe("The name of the person in the circle who wants it stopped, e.g. \"Dolores\"."),
        note: z.string().max(300).optional().describe("Why, in their words. The circle sees it."),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ paymentId, stoppedBy, note }) => {
      const d = await paymentDetail(paymentId);
      if (!d) return fail("No payment with that id.");
      const who = d.members.find((m) => m.name.toLowerCase() === stoppedBy.trim().toLowerCase());
      if (!who) return fail(`${stoppedBy} isn't in this circle. The circle is ${d.members.map((m) => m.name).join(", ")}.`);
      if (!isFamily(who) && who.role !== "care_recipient") return fail(`${who.name} can't stop payments in this circle.`);
      try {
        const done = await stopOwnPayment(paymentId, who.id, note);
        const c = await getCircleById(done.circleId);
        return json({ stopped: done.status === "voided", message: `Stopped. PayPal voided the hold on ${formatMoney(done.amountMinor, done.currency)} to ${done.payeeName}, so it never left ${c.careRecipientName}'s account.` });
      } catch (e) {
        return fail(e instanceof OwnPaymentError ? e.message : `Couldn't stop it: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  );

  return server;
}
