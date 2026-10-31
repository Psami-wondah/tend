import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { getCircle, getCircleById, getMembers, potBalanceMinor, reservedMinor, spentThisMonthByCategory, activeMandate } from "./circle";
import { listRecoveries } from "./recoveries";
import { pendingShares } from "./contributions";
import { isFamily } from "./people";
import type { Member } from "./db/schema";

const { paymentIntents, approvals, ledgerEntries, alerts, auditEvents, intakes, recoveries } = schema;

/** The viewer: whoever was picked on the welcome screen, else the circle's owner. */
export function pickViewer(members: Member[], asMemberId?: string | null): Member {
  const family = members.filter(isFamily);
  return members.find((m) => m.id === asMemberId) ?? family.find((m) => m.role === "owner") ?? family[0] ?? members[0];
}

/** Everything the family home screen needs, in one call. */
export async function dashboard(asMemberId?: string | null) {
  const db = await getDb();
  const circle = await getCircle();
  const members = await getMembers(circle.id);
  const family = members.filter(isFamily);
  const me = pickViewer(members, asMemberId);
  const mum = members.find((m) => m.role === "care_recipient") ?? null;

  const waiting = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circle.id), eq(paymentIntents.funding, "pot"), inArray(paymentIntents.status, ["awaiting_approval", "on_hold"])))
    .orderBy(desc(paymentIntents.createdAt));
  // Own-wallet payments authorized but held: the cooling-off.
  const held = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circle.id), eq(paymentIntents.funding, "own"), eq(paymentIntents.status, "held")))
    .orderBy(desc(paymentIntents.createdAt));
  const own = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circle.id), eq(paymentIntents.funding, "own")))
    .orderBy(desc(paymentIntents.createdAt))
    .limit(40);
  const votes = waiting.length ? await db.select().from(approvals).where(inArray(approvals.intentId, waiting.map((w) => w.id))) : [];

  const ledger = await db.select().from(ledgerEntries).where(eq(ledgerEntries.circleId, circle.id)).orderBy(asc(ledgerEntries.createdAt));
  let running = 0;
  const passbook = ledger.map((e) => ({ ...e, balanceMinor: (running += e.amountMinor) })).reverse();

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const stopped = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circle.id), inArray(paymentIntents.status, ["refused", "voided"]), gte(paymentIntents.createdAt, since)))
    .orderBy(desc(paymentIntents.createdAt))
    .limit(3);

  const paying = await db
    .select({ id: paymentIntents.id })
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circle.id), eq(paymentIntents.status, "paying")));

  const recent = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.circleId, circle.id), isNull(alerts.readAt)))
    .orderBy(desc(alerts.createdAt))
    .limit(6);

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const contributedBy = family.map((m) => {
    const mine = ledger.filter((e) => e.type === "contribution" && e.memberId === m.id);
    return {
      member: m,
      totalMinor: mine.reduce((a, e) => a + e.amountMinor, 0),
      thisMonthMinor: mine.filter((e) => e.createdAt >= monthStart).reduce((a, e) => a + e.amountMinor, 0),
    };
  });

  const shares = await pendingShares(circle.id);

  return {
    circle,
    me,
    mum,
    family,
    members,
    balanceMinor: await potBalanceMinor(circle.id),
    reservedMinor: await reservedMinor(circle.id),
    waiting: waiting.map((w) => ({
      intent: w,
      approvals: votes
        .filter((v) => v.intentId === w.id && v.verdict === "approve")
        .map((v) => ({ memberId: v.memberId, name: members.find((m) => m.id === v.memberId)?.name ?? "?", at: v.createdAt })),
      myVote: votes.find((v) => v.intentId === w.id && v.memberId === me.id)?.verdict ?? null,
    })),
    passbook,
    stopped,
    payingCount: paying.length,
    alerts: recent,
    contributedBy,
    recoveries: await listRecoveries(circle.id),
    held,
    ownRecent: own.filter((i) => i.status !== "awaiting_payer").slice(0, 6),
    /** Money that stayed in the person's account in the last 30 days: holds stopped and scams refused. */
    keptMinor: own.filter((i) => (i.status === "voided" || i.status === "refused") && i.createdAt >= since).reduce((a, i) => a + i.amountMinor, 0),
    heldMinor: held.reduce((a, i) => a + i.amountMinor, 0),
    myPendingShares: shares.filter((s) => s.memberId === me.id),
    pendingShareCount: shares.length,
    spentThisMonth: await spentThisMonthByCategory(circle.id),
    mandate: await activeMandate(circle.id),
  };
}

export type Dashboard = Awaited<ReturnType<typeof dashboard>>;

export async function paymentDetail(id: string) {
  const db = await getDb();
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, id));
  if (!intent) return null;
  const members = await getMembers(intent.circleId);
  const votes = await db.select().from(approvals).where(eq(approvals.intentId, id));
  const trail = await db.select().from(auditEvents).where(eq(auditEvents.intentId, id)).orderBy(asc(auditEvents.createdAt));
  const [intake] = intent.intakeId ? await db.select().from(intakes).where(eq(intakes.id, intent.intakeId)) : [];
  const [recovery] = await db.select().from(recoveries).where(eq(recoveries.intentId, id));
  return {
    intent,
    votes: votes.map((v) => ({ ...v, name: members.find((m) => m.id === v.memberId)?.name ?? "?" })),
    trail,
    intake: intake ?? null,
    members,
    family: members.filter(isFamily),
    recovery: recovery ?? null,
  };
}

/** Every ledger line joined to what caused it, for the passbook grid. */
export async function passbookRows(circleId?: string) {
  const db = await getDb();
  const circle = circleId ? await getCircleById(circleId) : await getCircle();
  const members = await getMembers(circle.id);
  const ledger = await db.select().from(ledgerEntries).where(eq(ledgerEntries.circleId, circle.id)).orderBy(asc(ledgerEntries.createdAt));
  const intentIds = ledger.map((e) => e.intentId).filter((x): x is string => Boolean(x));
  const intents = intentIds.length ? await db.select().from(paymentIntents).where(inArray(paymentIntents.id, intentIds)) : [];
  const votes = intentIds.length ? await db.select().from(approvals).where(inArray(approvals.intentId, intentIds)) : [];
  let running = 0;
  const rows: {
    id: string;
    at: string;
    type: "contribution" | "payment" | "refund" | "verification" | "own";
    status: string;
    description: string;
    who: string;
    payee: string | null;
    category: string;
    reference: string | null;
    inMinor: number;
    outMinor: number;
    balanceMinor: number | null;
    intentId: string | null;
    paypalId: string | null;
  }[] = ledger.map((e) => {
    running += e.amountMinor;
    const intent = intents.find((i) => i.id === e.intentId);
    const who =
      e.type === "contribution" || e.type === "verification"
        ? members.find((m) => m.id === e.memberId)?.name ?? ""
        : e.type === "refund"
          ? ""
          : votes
            .filter((v) => v.intentId === e.intentId && v.verdict === "approve")
            .map((v) => members.find((m) => m.id === v.memberId)?.name)
            .filter(Boolean)
            .join(", ") || (intent ? "Tend (auto-pay)" : "");
    return {
      id: e.id,
      at: e.createdAt.toISOString(),
      type: e.type,
      status: e.type === "contribution" ? "in" : e.type === "refund" ? "refunded" : "paid",
      description: e.description,
      who,
      payee: intent?.payeeName ?? null,
      category: e.type === "contribution" ? "top-up" : e.type === "refund" ? "refund" : e.type === "verification" ? "verification" : intent?.category ?? "other",
      reference: intent?.reference ?? null,
      inMinor: e.amountMinor > 0 ? e.amountMinor : 0,
      outMinor: e.amountMinor < 0 ? -e.amountMinor : 0,
      balanceMinor: running,
      intentId: e.intentId,
      paypalId: e.type === "payment" ? intent?.paypalTransactionId ?? intent?.paypalBatchId ?? null : null,
    };
  });
  // Payments from the person's own PayPal: not the pot, so no running balance.
  const own = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circle.id), eq(paymentIntents.funding, "own"), inArray(paymentIntents.status, ["paid", "held", "voided", "refused", "paying"])));
  const ownWord: Record<string, string> = { paid: "paid", held: "held", voided: "stopped", refused: "refused", paying: "paying" };
  for (const i of own) {
    const payer = members.find((m) => m.id === i.payerId)?.name ?? "They";
    const stopper = members.find((m) => m.id === i.stoppedBy)?.name;
    rows.push({
      id: i.id,
      at: i.createdAt.toISOString(),
      type: "own",
      status: ownWord[i.status] ?? i.status,
      description: `${i.payeeName} — ${i.summary}`,
      who: i.status === "voided" && stopper ? `${payer}, stopped by ${stopper}` : payer,
      payee: i.payeeName,
      category: i.category,
      reference: i.reference,
      inMinor: 0,
      outMinor: i.amountMinor,
      balanceMinor: null,
      intentId: i.id,
      paypalId: i.paypalCaptureId ?? i.paypalAuthorizationId ?? null,
    });
  }
  rows.sort((a, b) => b.at.localeCompare(a.at));
  return { circle, members, rows };
}

export type PassbookRow = Awaited<ReturnType<typeof passbookRows>>["rows"][number];
