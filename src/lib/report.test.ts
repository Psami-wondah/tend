/**
 * The circle's dashboard data (AG Studio), its saved views, and the
 * translation between AG Studio's assistant and Tend's model.
 */
import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = ":memory:";
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

import { seedAll } from "./db/seed-demo";
import { circleReport, clearDashboard, saveDashboard, savedDashboard, DashboardError } from "./report";
import { toMessages } from "./agent/studio-turn";

let all: Awaited<ReturnType<typeof seedAll>>;

beforeAll(async () => {
  all = await seedAll();
});

describe("circle report", () => {
  it("tells Walter's story: what was paid, what was kept, who stepped in", async () => {
    const r = await circleReport(all.walter.circle.id);
    expect(r.circle).toMatchObject({ person: "Walter", pot: false });

    const roofer = r.payments.find((p) => p.payee === "Ridgeline Roofing")!;
    expect(roofer).toMatchObject({ outcome: "Stopped", kept: 1850, paid: 0, money: "Walter's own PayPal" });
    const prize = r.payments.find((p) => p.payee === "Publishers Prize Center")!;
    expect(prize).toMatchObject({ outcome: "Refused", decision: "Refused", kept: 49.99 });

    const kept = r.payments.reduce((a, p) => a + p.kept, 0);
    const paid = r.payments.reduce((a, p) => a + p.paid, 0);
    expect(kept).toBeCloseTo(1850 + 499.99 + 49.99 + 200, 2);
    expect(paid).toBeGreaterThan(2000);

    const did = r.actions.map((a) => `${a.person}: ${a.action} (${a.payee})`);
    expect(did).toEqual(
      expect.arrayContaining([
        "Dolores: Stopped it (Ridgeline Roofing)",
        "Priya: Said yes (Tucson Dental Group)",
        "Priya: Let it go (Copper State Plumbing)",
        "Dolores: Let it go (Food City Delivery)",
      ]),
    );
    const stop = r.actions.find((a) => a.action === "Stopped it")!;
    expect(stop.minutesToAct).toBe(95);
    expect(["In their daytime", "In their night"]).toContain(stop.awake);
    expect(r.shares).toHaveLength(0);
  });

  it("charts weeks in order and leaves out payments never approved in PayPal", async () => {
    const r = await circleReport(all.walter.circle.id);
    for (const p of r.payments) {
      expect(new Date(`${p.week}T00:00:00Z`).getUTCDay()).toBe(1);
      expect(p.week <= p.date.slice(0, 10)).toBe(true);
    }
    expect(r.payments.every((p) => p.outcome !== "Paying")).toBe(true);
  });

  it("includes the family's shares when there is a pot", async () => {
    const r = await circleReport(all.okafor.circle.id);
    expect(r.circle.pot).toBe(true);
    expect(r.shares.length).toBeGreaterThan(3);
    expect(new Set(r.shares.map((s) => s.person))).toEqual(new Set(["Ada", "Tunde", "Chioma"]));
    expect(r.payments.some((p) => p.money === "The care pot")).toBe(true);
  });
});

describe("saved dashboards", () => {
  it("saves one view for the whole circle, and goes back to Tend's", async () => {
    const priya = all.walter.members.priya;
    expect(await savedDashboard(all.walter.circle.id)).toBeNull();
    const state = { pages: [{ id: "mine", widgets: {} }], selectedPageId: "mine" };
    await saveDashboard(priya.id, state);
    expect(await savedDashboard(all.walter.circle.id)).toMatchObject({ state, by: "Priya" });

    // A second save replaces the first; there is one dashboard per circle.
    await saveDashboard(all.walter.members.dolores.id, { ...state, selectedPageId: "mine" });
    expect((await savedDashboard(all.walter.circle.id))?.by).toBe("Dolores");

    // Another circle is untouched.
    expect(await savedDashboard(all.okafor.circle.id)).toBeNull();

    await clearDashboard(priya.id);
    expect(await savedDashboard(all.walter.circle.id)).toBeNull();
  });

  it("refuses a dashboard with no pages, or from someone unknown", async () => {
    await expect(saveDashboard(all.walter.members.priya.id, { pages: [] })).rejects.toThrow(DashboardError);
    await expect(saveDashboard("nobody", { pages: [{ id: "x" }] })).rejects.toThrow(DashboardError);
  });
});

describe("AG Studio's assistant, on Tend's model", () => {
  it("turns its conversation into one assistant message per turn and matched tool results", () => {
    const messages = toMessages([
      { type: "message", role: "system", content: [{ type: "text", text: "Dashboard rules." }] },
      { type: "message", role: "user", content: [{ type: "text", text: "Chart what was kept." }] },
      { type: "reasoning" },
      { type: "message", role: "assistant", content: [{ type: "text", text: "Reading the page first." }] },
      { type: "function_call", callId: "c1", name: "view_report", arguments: "{}" },
      { type: "function_call", callId: "c2", name: "read_schema", arguments: "not json" },
      { type: "function_call_output", callId: "c1", output: "two pages" },
      { type: "function_call_output", callId: "c2", output: "three sources" },
      { type: "message", role: "assistant", content: [{ type: "text", text: "Done." }] },
    ]);
    expect(messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "assistant"]);
    expect(messages[2].content).toEqual([
      { type: "text", text: "Reading the page first." },
      { type: "tool-call", toolCallId: "c1", toolName: "view_report", input: {} },
      { type: "tool-call", toolCallId: "c2", toolName: "read_schema", input: {} },
    ]);
    expect(messages[3].content).toEqual([
      { type: "tool-result", toolCallId: "c1", toolName: "view_report", output: { type: "text", value: "two pages" } },
      { type: "tool-result", toolCallId: "c2", toolName: "read_schema", output: { type: "text", value: "three sources" } },
    ]);
  });

  it("skips empty messages", () => {
    expect(toMessages([{ type: "message", role: "user", content: [] }])).toEqual([]);
  });
});
