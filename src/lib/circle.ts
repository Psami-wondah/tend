import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "./db/client";
import type { Mandate } from "./mandate/types";
import { DEFAULT_MANDATE } from "./mandate/defaults";
import type { Payee } from "./db/schema";
import { pushAlert } from "./push";

const { circles, members, payees, mandates, paymentIntents, ledgerEntries, auditEvents, alerts } = schema;

/**
 * The circle being viewed: the one the current viewer belongs to (demo
 * stand-in for sign-in), else the first circle. Outside a request (scripts,
 * tests, webhooks) there's no viewer, so it's the first circle.
 */
export async function getCircle() {
  const db = await getDb();
  const viewer = await viewerFromCookie();
  if (viewer) {
    const [m] = await db.select({ circleId: members.circleId }).from(members).where(eq(members.id, viewer));
    if (m) {
      const [c] = await db.select().from(circles).where(eq(circles.id, m.circleId));
      if (c) return c;
    }
  }
  const [circle] = await db.select().from(circles).orderBy(asc(circles.createdAt)).limit(1);
  if (!circle) throw new Error("No circle found. Run `npm run db:seed` first.");
  return circle;
}

export async function getCircleById(id: string) {
  const db = await getDb();
  const [c] = await db.select().from(circles).where(eq(circles.id, id));
  if (!c) throw new Error("Circle not found");
  return c;
}

export async function listCircles() {
  const db = await getDb();
  return db.select().from(circles).orderBy(asc(circles.createdAt));
}

async function viewerFromCookie(): Promise<string | null> {
  const { viewerId } = await import("./viewer");
  return viewerId();
}

export async function getMembers(circleId: string) {
  const db = await getDb();
  return db.select().from(members).where(eq(members.circleId, circleId));
}

export async function getMember(memberId: string) {
  const db = await getDb();
  const [m] = await db.select().from(members).where(eq(members.id, memberId));
  return m ?? null;
}

export async function activeMandate(circleId: string): Promise<Mandate> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(mandates)
    .where(eq(mandates.circleId, circleId))
    .orderBy(desc(mandates.version))
    .limit(1);
  return row?.rules ?? DEFAULT_MANDATE;
}

export async function potBalanceMinor(circleId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${ledgerEntries.amountMinor}), 0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.circleId, circleId));
  return Number(row?.total ?? 0);
}

/** Money committed to payments that haven't settled yet — can't be spent twice. */
export async function reservedMinor(circleId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${paymentIntents.amountMinor}), 0)` })
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.circleId, circleId),
        eq(paymentIntents.funding, "pot"),
        inArray(paymentIntents.status, ["approved", "paying"]),
      ),
    );
  return Number(row?.total ?? 0);
}

export async function spentThisMonthByCategory(circleId: string) {
  const db = await getDb();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db
    .select({
      category: paymentIntents.category,
      total: sql<string>`sum(${paymentIntents.amountMinor})`,
    })
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.circleId, circleId),
        eq(paymentIntents.funding, "pot"),
        inArray(paymentIntents.status, ["paid", "paying", "approved"]),
        gte(paymentIntents.createdAt, start),
      ),
    )
    .groupBy(paymentIntents.category);
  return Object.fromEntries(rows.map((r) => [r.category, Number(r.total)]));
}

// --- Payee matching -------------------------------------------------------------

const NOISE = /\b(ltd|limited|inc|llc|plc|co|company|the|&|and)\b/g;

export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchPayee(
  list: Payee[],
  name: string,
  email: string | null,
): Payee | null {
  if (email) {
    const e = email.trim().toLowerCase();
    const byEmail = list.find((p) => p.paypalEmail.toLowerCase() === e);
    if (byEmail) return byEmail;
  }
  const n = normaliseName(name);
  if (!n) return null;
  for (const p of list) {
    const names = [p.name, ...p.aliases].map(normaliseName);
    if (names.some((x) => x === n || (x.length > 4 && (n.includes(x) || x.includes(n))))) {
      return p;
    }
  }
  return null;
}

export async function listPayees(circleId: string) {
  const db = await getDb();
  return db.select().from(payees).where(eq(payees.circleId, circleId));
}

export async function payeePreviouslyPaid(payeeId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ id: paymentIntents.id })
    .from(paymentIntents)
    .where(and(eq(paymentIntents.payeeId, payeeId), eq(paymentIntents.status, "paid")))
    .limit(1);
  return Boolean(row);
}

/**
 * Same payee + same amount + same reference in the last 30 days. When either
 * side has no reference (a taxi fare, say) the window shrinks to 3 days, so a
 * regular same-price ride isn't mistaken for a double charge.
 */
export async function findDuplicate(opts: {
  circleId: string;
  payeeId: string | null;
  amountMinor: number;
  reference: string | null;
}): Promise<string | null> {
  if (!opts.payeeId) return null;
  const db = await getDb();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const rows = await db
    .select({ id: paymentIntents.id, reference: paymentIntents.reference, createdAt: paymentIntents.createdAt })
    .from(paymentIntents)
    .where(
      and(
        eq(paymentIntents.circleId, opts.circleId),
        eq(paymentIntents.payeeId, opts.payeeId),
        eq(paymentIntents.amountMinor, opts.amountMinor),
        eq(paymentIntents.funding, "pot"),
        inArray(paymentIntents.status, ["paid", "paying", "approved", "awaiting_approval"]),
        gte(paymentIntents.createdAt, since),
      ),
    );
  const recent = Date.now() - 3 * 24 * 3600 * 1000;
  const hit = rows.find((r) =>
    opts.reference && r.reference ? r.reference === opts.reference : r.createdAt.getTime() >= recent,
  );
  return hit?.id ?? null;
}

// --- Audit + alerts ------------------------------------------------------------

export async function audit(
  circleId: string,
  actor: string,
  type: string,
  data: Record<string, unknown> = {},
  intentId: string | null = null,
) {
  const db = await getDb();
  await db.insert(auditEvents).values({ circleId, actor, type, data, intentId });
}

export async function alert(
  circleId: string,
  severity: "info" | "action" | "danger",
  title: string,
  body: string,
  intentId: string | null = null,
) {
  const db = await getDb();
  await db.insert(alerts).values({ circleId, severity, title, body, intentId });
  // Phones are buzzed in the background; a slow push service never holds up a payment.
  void pushAlert(circleId, severity, title, body, intentId).catch((e) => console.error("push alert failed", e));
}
