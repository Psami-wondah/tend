/**
 * Alerts on the circle's phones: who gets buzzed, what's on the notification,
 * and that subscriptions survive a demo reset. The push service is faked.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = ":memory:";
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;

const sent: { endpoint: string; payload: Record<string, unknown> }[] = [];
const gone = new Set<string>();
vi.mock("web-push", async (original) => {
  const real = ((await original()) as { default: typeof import("web-push") }).default;
  return {
    default: {
      generateVAPIDKeys: real.generateVAPIDKeys,
      sendNotification: vi.fn(async (sub: { endpoint: string }, body: string) => {
        if (gone.has(sub.endpoint)) throw Object.assign(new Error("Gone"), { statusCode: 410 });
        sent.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
        return { statusCode: 201 };
      }),
    },
  };
});

import { sql } from "drizzle-orm";
import { seedAll } from "./db/seed-demo";
import { getDb, schema } from "./db/client";
import { pushAlert, pushKeys, pushRestore, pushSnapshot, PushError, subscribe } from "./push";
import { confirmOwnPayment, startOwnPayment } from "./own-payments";
import type { Extraction } from "./agent/schemas";

let all: Awaited<ReturnType<typeof seedAll>>;
const device = (name: string) => ({ endpoint: `https://push.example.com/${name}`, keys: { p256dh: "BPk", auth: "au" } });
const settle = () => new Promise((r) => setTimeout(r, 50));

const roofer: Extraction = {
  kind: "bill",
  isPaymentRequest: true,
  payeeName: "Ridgeline Roofing",
  payeeEmail: "jobs@ridgeline-roof.example.com",
  amount: 650,
  currency: "USD",
  category: "other",
  method: "paypal",
  reference: null,
  dueDate: null,
  summary: "A roofer at the door wants a deposit today.",
  scam: { impersonation: false, urgency: true, secrecy: false, unusualMethod: false, unsolicited: true, riskScore: 0.45, explanation: "A stranger at the door asking for money up front." },
  confidence: 0.9,
};

beforeAll(async () => {
  all = await seedAll();
});

describe("alerts on the circle's phones", () => {
  it("makes its keys once and keeps them", async () => {
    const a = await pushKeys();
    expect(a.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect((await pushKeys()).publicKey).toBe(a.publicKey);
  });

  it("only lets people in the circle turn alerts on, and says hello when they do", async () => {
    await expect(subscribe(all.walter.members.walter.id, device("walter"))).rejects.toThrow(PushError);
    sent.length = 0;
    await subscribe(all.walter.members.dolores.id, device("dolores"));
    await subscribe(all.walter.members.priya.id, device("priya"));
    expect(sent.map((s) => s.payload.title)).toEqual(["Alerts are on", "Alerts are on"]);
    expect(String(sent[0].payload.body)).toContain("Walter");
  });

  it("buzzes Priya and Dolores, not Walter, when his payment is held, with Stop it and Say yes on it", async () => {
    sent.length = 0;
    const start = await startOwnPayment({ payerId: all.walter.members.walter.id, source: "voice", preExtracted: roofer });
    await confirmOwnPayment(start.intent!.id, start.orderId!);
    await settle();
    const held = sent.filter((s) => s.payload.intentId === start.intent!.id);
    expect(held.map((s) => s.endpoint).sort()).toEqual([device("dolores").endpoint, device("priya").endpoint]);
    expect(held[0].payload).toMatchObject({
      payee: "Ridgeline Roofing",
      person: "Walter",
      url: `/payments/${start.intent!.id}`,
      actions: [
        { action: "reject", title: "Stop it" },
        { action: "approve", title: "Say yes" },
      ],
    });
    expect(String(held[0].payload.title)).toContain("$650.00");
    // Each notification knows whose phone it is on, so Stop it acts as that person.
    expect(new Set(held.map((s) => s.payload.memberId))).toEqual(new Set([all.walter.members.dolores.id, all.walter.members.priya.id]));
  });

  it("stays quiet for information, and forgets a phone the push service says is gone", async () => {
    sent.length = 0;
    await pushAlert(all.walter.circle.id, "info", "Saguaro Pharmacy verified", "Fine.", null);
    expect(sent).toHaveLength(0);

    gone.add(device("priya").endpoint);
    await pushAlert(all.walter.circle.id, "danger", "Tend stopped a $89.00 payment from Walter", "Someone posing as Medicare.", null);
    expect(sent.map((s) => s.endpoint)).toEqual([device("dolores").endpoint]);
    const db = await getDb();
    const left = await db.select().from(schema.pushSubscriptions);
    expect(left.map((r) => r.endpoint)).toEqual([device("dolores").endpoint]);
    gone.clear();
  });

  it("keeps alerts on across a demo reset", async () => {
    const before = await pushSnapshot();
    expect(before).toEqual([expect.objectContaining({ circle: all.walter.circle.name, name: "Dolores" })]);
    const db = await getDb();
    await db.execute(sql`TRUNCATE push_subscriptions, dashboards, recoveries, alerts, audit_events, ledger_entries, contributions, approvals,
      payment_intents, intakes, mandates, payees, members, circles CASCADE`);
    all = await seedAll();
    await pushRestore(before);
    const after = await db.select().from(schema.pushSubscriptions);
    expect(after).toEqual([expect.objectContaining({ memberId: all.walter.members.dolores.id, endpoint: device("dolores").endpoint })]);
    // The keys outlive the reset too, so the phone's subscription still matches.
    expect((await db.select().from(schema.appSettings)).map((r) => r.key)).toEqual(["vapid"]);
  });
});
