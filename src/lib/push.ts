import webpush from "web-push";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "./db/client";
import { appSettings, circles, members, paymentIntents, pushSubscriptions } from "./db/schema";
import { isFamily } from "./people";
import { configuredOrigin } from "./origin";

/**
 * Alerts on the circle's phones (Web Push). When Tend holds a payment or
 * stops a scam, everyone in the circle who turned alerts on gets a
 * notification, and a held payment carries Stop it and Say yes buttons that
 * work without opening Tend. The person at the centre is never buzzed.
 *
 * Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or are made once and
 * kept in the database, so devices stay subscribed across restarts.
 */

export class PushError extends Error {}

type Keys = { publicKey: string; privateKey: string };
let keys: Keys | null = null;

export async function pushKeys(): Promise<Keys> {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return keys;
  }
  const db = await getDb();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "vapid"));
  if (row) {
    keys = JSON.parse(row.value) as Keys;
    return keys;
  }
  const made = webpush.generateVAPIDKeys();
  await db.insert(appSettings).values({ key: "vapid", value: JSON.stringify(made) }).onConflictDoNothing();
  const [kept] = await db.select().from(appSettings).where(eq(appSettings.key, "vapid"));
  keys = JSON.parse(kept.value) as Keys;
  return keys;
}

export type DeviceSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function subscribe(memberId: string, sub: DeviceSubscription) {
  const db = await getDb();
  const [m] = await db.select().from(members).where(eq(members.id, memberId));
  if (!m) throw new PushError("Unknown person.");
  if (!isFamily(m)) throw new PushError("Alerts are for the people in the circle.");
  await db
    .insert(pushSubscriptions)
    .values({ memberId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
    .onConflictDoUpdate({ target: [pushSubscriptions.memberId, pushSubscriptions.endpoint], set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  const [circle] = await db.select().from(circles).where(eq(circles.id, m.circleId));
  await send([{ memberId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }], {
    title: "Alerts are on",
    body: `Tend will tell you here when something of ${circle?.careRecipientName ?? "theirs"} is held, and you can stop it from this notification.`,
    url: "/home",
    tag: "tend-welcome",
  });
}

export async function unsubscribe(memberId: string, endpoint: string) {
  const db = await getDb();
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.memberId, memberId), eq(pushSubscriptions.endpoint, endpoint)));
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  intentId?: string;
  payee?: string;
  person?: string;
  actions?: { action: "approve" | "reject"; title: string }[];
};

type Device = { memberId: string; endpoint: string; p256dh: string; auth: string };

async function send(devices: Device[], payload: PushPayload) {
  if (!devices.length) return;
  const k = await pushKeys();
  const origin = configuredOrigin();
  const subject = origin.startsWith("https://") ? origin : "mailto:alerts@tend.example.com";
  const db = await getDb();
  await Promise.all(
    devices.map(async (d) => {
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } },
          JSON.stringify({ ...payload, memberId: d.memberId }),
          { vapidDetails: { subject, publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 60 * 60 * 24, urgency: "high" },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // The browser dropped this subscription; forget it.
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.memberId, d.memberId), eq(pushSubscriptions.endpoint, d.endpoint)));
        } else console.error("push failed", status, (e as Error).message);
      }
    }),
  );
}

/**
 * Buzz the circle about an alert. Only alerts that need someone, or say a
 * scam was stopped, reach a phone; the rest stay on the home screen.
 */
export async function pushAlert(circleId: string, severity: "info" | "action" | "danger", title: string, body: string, intentId: string | null) {
  if (severity === "info") return;
  const db = await getDb();
  const people = (await db.select().from(members).where(eq(members.circleId, circleId))).filter(isFamily);
  if (!people.length) return;
  const devices = await db
    .select({ memberId: pushSubscriptions.memberId, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.memberId, people.map((p) => p.id)));
  if (!devices.length) return;

  const [intent] = intentId ? await db.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)) : [];
  const [circle] = await db.select().from(circles).where(eq(circles.id, circleId));
  let actions: PushPayload["actions"];
  if (intent?.funding === "own" && intent.status === "held") {
    actions = [
      { action: "reject", title: "Stop it" },
      { action: "approve", title: "Say yes" },
    ];
  } else if (intent && (intent.status === "awaiting_approval" || intent.status === "on_hold")) {
    actions = [
      { action: "approve", title: "Approve" },
      { action: "reject", title: "Decline" },
    ];
  }
  await send(devices, {
    title,
    body,
    url: intent ? `/payments/${intent.id}` : "/home",
    tag: intent ? `tend-${intent.id}` : `tend-${Date.now()}`,
    intentId: intent?.id,
    payee: intent?.payeeName ?? undefined,
    person: circle?.careRecipientName,
    actions,
  });
}

/** Who had alerts on, by circle and name, so a demo reset can keep them on. */
export async function pushSnapshot() {
  const db = await getDb();
  return db
    .select({ circle: circles.name, name: members.name, endpoint: pushSubscriptions.endpoint, p256dh: pushSubscriptions.p256dh, auth: pushSubscriptions.auth })
    .from(pushSubscriptions)
    .innerJoin(members, eq(members.id, pushSubscriptions.memberId))
    .innerJoin(circles, eq(circles.id, members.circleId));
}

export async function pushRestore(snapshot: Awaited<ReturnType<typeof pushSnapshot>>) {
  if (!snapshot.length) return;
  const db = await getDb();
  const people = await db.select({ id: members.id, name: members.name, circle: circles.name }).from(members).innerJoin(circles, eq(circles.id, members.circleId));
  for (const s of snapshot) {
    const m = people.find((p) => p.circle === s.circle && p.name === s.name);
    if (m) await db.insert(pushSubscriptions).values({ memberId: m.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }).onConflictDoNothing();
  }
}
