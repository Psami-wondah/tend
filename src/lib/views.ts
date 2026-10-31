import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import { getCircle, getMembers, potBalanceMinor, reservedMinor } from "./circle";

const { paymentIntents, approvals, ledgerEntries, alerts, auditEvents, intakes } = schema;

/** Everything the family dashboard needs, in one call. */
export async function dashboard(asMemberId?: string) {
  const db = await getDb();
  const circle = await getCircle();
  const members = await getMembers(circle.id);
  const family = members.filter((m) => m.role === "owner" || m.role === "sibling");
  const me = family.find((m) => m.id === asMemberId) ?? family.find((m) => m.role === "owner") ?? family[0];

  const waiting = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circle.id), inArray(paymentIntents.status, ["awaiting_approval", "on_hold"])))
    .orderBy(desc(paymentIntents.createdAt));

  const votes = waiting.length
    ? await db.select().from(approvals).where(inArray(approvals.intentId, waiting.map((w) => w.id)))
    : [];

  const ledger = await db
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.circleId, circle.id))
    .orderBy(asc(ledgerEntries.createdAt));
  let running = 0;
  const passbook = ledger
    .map((e) => {
      running += e.amountMinor;
      return { ...e, balanceMinor: running };
    })
    .reverse();

  const recentRefusals = await db
    .select()
    .from(paymentIntents)
    .where(and(eq(paymentIntents.circleId, circle.id), eq(paymentIntents.status, "refused")))
    .orderBy(desc(paymentIntents.createdAt))
    .limit(5);

  const unread = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.circleId, circle.id), isNull(alerts.readAt)))
    .orderBy(desc(alerts.createdAt))
    .limit(8);

  const contributedBy = family.map((m) => ({
    member: m,
    totalMinor: ledger.filter((e) => e.type === "contribution" && e.memberId === m.id).reduce((a, e) => a + e.amountMinor, 0),
  }));

  return {
    circle,
    me,
    family,
    balanceMinor: await potBalanceMinor(circle.id),
    reservedMinor: await reservedMinor(circle.id),
    waiting: waiting.map((w) => ({
      intent: w,
      approvals: votes.filter((v) => v.intentId === w.id && v.verdict === "approve").map((v) => members.find((m) => m.id === v.memberId)?.name ?? "?"),
      myVote: votes.find((v) => v.intentId === w.id && v.memberId === me?.id)?.verdict ?? null,
    })),
    passbook,
    recentRefusals,
    alerts: unread,
    contributedBy,
  };
}

export async function paymentDetail(id: string) {
  const db = await getDb();
  const [intent] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, id));
  if (!intent) return null;
  const members = await getMembers(intent.circleId);
  const votes = await db.select().from(approvals).where(eq(approvals.intentId, id));
  const trail = await db.select().from(auditEvents).where(eq(auditEvents.intentId, id)).orderBy(asc(auditEvents.createdAt));
  const [intake] = intent.intakeId ? await db.select().from(intakes).where(eq(intakes.id, intent.intakeId)) : [];
  return {
    intent,
    votes: votes.map((v) => ({ ...v, name: members.find((m) => m.id === v.memberId)?.name ?? "?" })),
    trail,
    intake: intake ?? null,
    family: members.filter((m) => m.role === "owner" || m.role === "sibling"),
  };
}
