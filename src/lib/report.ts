import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { getCircleById, getMember, getMembers } from "./circle";
import { categoryLabel } from "./mandate/edit";
import { isAwake } from "./time";

const { paymentIntents, approvals, auditEvents, contributions, intakes, dashboards } = schema;

/**
 * The circle's report: flat rows for the AG Studio dashboard on /passbook/dashboard.
 * Three sources, all plain values, so the dashboard's own engine can group,
 * filter and chart them: every payment and what happened to it, every time
 * someone in the circle stepped in, and every share paid into a pot.
 */
export interface ReportPayment {
  id: string;
  date: string;
  week: string;
  payee: string;
  category: string;
  amount: number;
  outcome: string;
  decision: string;
  money: string;
  sentAs: string;
  paid: number;
  kept: number;
  scamRisk: number | null;
}

export interface ReportAction {
  id: string;
  date: string;
  week: string;
  person: string;
  relation: string;
  action: string;
  payee: string;
  amount: number;
  minutesToAct: number;
  awake: string;
}

export interface ReportShare {
  id: string;
  date: string;
  week: string;
  person: string;
  amount: number;
  via: string;
}

export interface CircleReport {
  circle: { name: string; person: string; currency: string; pot: boolean };
  payments: ReportPayment[];
  actions: ReportAction[];
  shares: ReportShare[];
}

const DECISION: Record<string, string> = {
  auto_pay: "Paid at once",
  cool_off: "Held for a while",
  needs_approval: "Needed a yes",
  hold: "Waited for money in the pot",
  refuse: "Refused",
};

/** Monday of the week, as a date (UTC), so weeks chart in order. */
function weekOf(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

const major = (minor: number) => Math.round(minor) / 100;

export async function circleReport(circleId: string): Promise<CircleReport> {
  const db = await getDb();
  const circle = await getCircleById(circleId);
  const members = await getMembers(circleId);
  const byId = new Map(members.map((m) => [m.id, m]));

  // Payments the person never approved in PayPal didn't happen; leave them out.
  const intents = (await db.select().from(paymentIntents).where(eq(paymentIntents.circleId, circleId))).filter((i) => i.status !== "awaiting_payer");
  const ids = intents.map((i) => i.id);
  const intakeIds = intents.map((i) => i.intakeId).filter((x): x is string => Boolean(x));
  const reads = intakeIds.length ? await db.select().from(intakes).where(inArray(intakes.id, intakeIds)) : [];
  const votes = ids.length ? await db.select().from(approvals).where(inArray(approvals.intentId, ids)) : [];
  const events = ids.length
    ? await db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.circleId, circleId), inArray(auditEvents.type, ["stopped", "released", "expired"]), inArray(auditEvents.intentId, ids)))
    : [];
  const lapsed = new Set(events.filter((e) => e.type === "expired").map((e) => e.intentId));

  const outcome = (i: (typeof intents)[number]): string => {
    switch (i.status) {
      case "paid":
        return "Paid";
      case "held":
        return i.decision === "needs_approval" ? "Waiting for a yes" : "Held for the circle";
      case "voided":
        return lapsed.has(i.id) ? "Lapsed, nobody said yes" : "Stopped";
      case "refused":
        return "Refused";
      case "rejected":
        return "Turned down";
      case "awaiting_approval":
        return "Waiting for a yes";
      case "on_hold":
        return "Waiting for money in the pot";
      case "failed":
        return "Didn't go through";
      default:
        return "Paying";
    }
  };

  const payments: ReportPayment[] = intents.map((i) => {
    const read = reads.find((r) => r.id === i.intakeId);
    const amount = major(i.amountMinor);
    const out = outcome(i);
    return {
      id: i.id,
      date: i.createdAt.toISOString(),
      week: weekOf(i.createdAt),
      payee: i.payeeName,
      category: categoryLabel(i.category),
      amount,
      outcome: out,
      decision: DECISION[i.decision] ?? i.decision,
      money: i.funding === "own" ? `${circle.careRecipientName}'s own PayPal` : "The care pot",
      sentAs: read ? { photo: "A photo", voice: "Said out loud", text: "A message" }[read.source] : "Set up by the circle",
      paid: i.status === "paid" ? amount : 0,
      kept: ["voided", "refused", "rejected"].includes(i.status) ? amount : 0,
      scamRisk: read?.extraction ? read.extraction.scam.riskScore : null,
    };
  });

  const step = (id: string, at: Date, memberId: string, action: string, intentId: string): ReportAction | null => {
    const m = byId.get(memberId);
    const i = intents.find((x) => x.id === intentId);
    if (!m || !i) return null;
    return {
      id,
      date: at.toISOString(),
      week: weekOf(at),
      person: m.name,
      relation: m.relation ?? "",
      action,
      payee: i.payeeName,
      amount: major(i.amountMinor),
      minutesToAct: Math.max(0, Math.round((at.getTime() - i.createdAt.getTime()) / 60_000)),
      awake: isAwake(m.timezone, at) ? "In their daytime" : "In their night",
    };
  };

  // Stopping or letting a payment go also records that person's vote; count what they did once.
  const acted = new Set(events.filter((e) => e.actor.startsWith("member:") && e.intentId).map((e) => `${e.actor.slice("member:".length)}:${e.intentId}`));
  const actions = [
    ...votes
      .filter((v) => !acted.has(`${v.memberId}:${v.intentId}`))
      .map((v) => step(v.id, v.createdAt, v.memberId, v.verdict === "approve" ? "Said yes" : "Said no", v.intentId)),
    ...events
      .filter((e) => e.actor.startsWith("member:") && e.intentId)
      .map((e) => {
        const i = intents.find((x) => x.id === e.intentId);
        const action = e.type === "stopped" ? "Stopped it" : i?.decision === "needs_approval" ? "Said yes" : "Let it go";
        return step(e.id, e.createdAt, e.actor.slice("member:".length), action, e.intentId!);
      }),
  ].filter((a): a is ReportAction => a !== null);

  const paidIn = await db
    .select()
    .from(contributions)
    .where(and(eq(contributions.circleId, circleId), eq(contributions.status, "completed")));
  const shares: ReportShare[] = paidIn.map((c) => ({
    id: c.id,
    date: c.createdAt.toISOString(),
    week: weekOf(c.createdAt),
    person: byId.get(c.memberId)?.name ?? "Someone",
    amount: major(c.amountMinor),
    via: c.source === "invoice" ? "PayPal invoice" : "PayPal checkout",
  }));

  return {
    circle: {
      name: circle.name,
      person: circle.careRecipientName,
      currency: circle.currency,
      pot: circle.potEnabled,
    },
    payments,
    actions,
    shares,
  };
}

// --- The circle's saved dashboard ------------------------------------------------

export class DashboardError extends Error {}

const MAX_STATE_BYTES = 400_000;

/** The dashboard someone in the circle saved, if any, with who saved it and when. */
export async function savedDashboard(circleId: string) {
  const db = await getDb();
  const [row] = await db.select().from(dashboards).where(eq(dashboards.circleId, circleId));
  if (!row) return null;
  const by = row.savedBy ? await getMember(row.savedBy) : null;
  return {
    state: row.state,
    by: by?.name ?? null,
    at: row.savedAt.toISOString(),
  };
}

/** Save a dashboard for the whole circle. Only someone in that circle can. */
export async function saveDashboard(memberId: string, state: Record<string, unknown>) {
  const m = await getMember(memberId);
  if (!m) throw new DashboardError("Unknown member.");
  if (!Array.isArray(state.pages) || !state.pages.length) throw new DashboardError("That dashboard has no pages.");
  if (JSON.stringify(state).length > MAX_STATE_BYTES) throw new DashboardError("That dashboard is too big to save.");
  const db = await getDb();
  const savedAt = new Date();
  await db
    .insert(dashboards)
    .values({ circleId: m.circleId, state, savedBy: m.id, savedAt })
    .onConflictDoUpdate({
      target: dashboards.circleId,
      set: { state, savedBy: m.id, savedAt },
    });
  return { by: m.name, at: savedAt.toISOString() };
}

/** Go back to Tend's own dashboard for the circle. */
export async function clearDashboard(memberId: string) {
  const m = await getMember(memberId);
  if (!m) throw new DashboardError("Unknown member.");
  const db = await getDb();
  await db.delete(dashboards).where(eq(dashboards.circleId, m.circleId));
}
