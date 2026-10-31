/**
 * Tend as an MCP server, through a real MCP client: an agent can ask the
 * second key first, and the only thing it can do to money is keep it where it is.
 */
import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = ":memory:";
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildTendMcp } from "./server";
import { seedAll } from "../db/seed-demo";
import { confirmOwnPayment, startOwnPayment } from "../own-payments";

let client: Client;
let walterId: string;

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { text: string }[])[0].text;
  return { error: Boolean(r.isError), text, data: r.isError ? null : JSON.parse(text) };
}

beforeAll(async () => {
  const all = await seedAll();
  walterId = all.walter.members.walter.id;
  const [a, b] = InMemoryTransport.createLinkedPair();
  await buildTendMcp().connect(a);
  client = new Client({ name: "test", version: "0" });
  await client.connect(b);
});

describe("Tend MCP server", () => {
  it("offers read tools and one protective action, and nothing that pays", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("check_payment_request");
    expect(names).toContain("stop_held_payment");
    expect(names.some((n) => /pay_|release|capture|send|approve/.test(n.replace("check_payment_request", "")))).toBe(false);
    for (const t of tools.filter((t) => t.name !== "stop_held_payment")) expect(t.annotations?.readOnlyHint).toBe(true);
  });

  it("refuses a real PayPal invoice with a fake support number", async () => {
    const r = await call("check_payment_request", {
      circle: "Walter",
      text: "PayPal: You have a new invoice from Norton Security for $389.00. If you did not authorize this, call +1 (844) 555-0142 to cancel and get a refund.",
    });
    expect(r.data.decision).toBe("refuse");
    expect(r.data.reasons[0]).toMatch(/PayPal never puts a support number/);
    expect(r.data.payee).toBe("Norton Security");
  });

  it("lets a routine refill through and holds a stranger at the door", async () => {
    const refill = await call("check_payment_request", { circle: "Walter", text: "Saguaro Pharmacy refill ready, heart tablets, $38.20, ref SR-2361." });
    expect(refill.data.decision).toBe("auto_pay");
    const roofer = await call("check_payment_request", { circle: "Walter", text: "Ridgeline Roofing needs a $650 deposit today. Pay to jobs@ridgeline-roof.example.com" });
    expect(roofer.data.decision).toBe("cool_off");
  });

  it("stops a held payment only for someone in the circle", async () => {
    const start = await startOwnPayment({ payerId: walterId, source: "text", text: "Ridgeline Roofing needs a $650 deposit today. Pay to jobs@ridgeline-roof.example.com" });
    await confirmOwnPayment(start.intent!.id, start.orderId!);
    const held = await call("list_held_payments", { circle: "Walter" });
    expect(held.data).toHaveLength(1);
    const id = held.data[0].paymentId;

    expect((await call("stop_held_payment", { paymentId: id, stoppedBy: "Mallory" })).error).toBe(true);
    const stopped = await call("stop_held_payment", { paymentId: id, stoppedBy: "Dolores", note: "No such job." });
    expect(stopped.data.stopped).toBe(true);

    const explained = await call("explain_payment", { paymentId: id });
    expect(explained.data.status).toBe("stopped");
    expect(explained.data.trail.at(-1).by).toBe("Dolores");
  });

  it("answers passbook questions per circle", async () => {
    const r = await call("search_passbook", { circle: "Walter", question: "what was stopped or refused?" });
    expect(r.data.rows.every((row: { status: string }) => row.status === "stopped" || row.status === "refused")).toBe(true);
    expect(r.data.count).toBeGreaterThanOrEqual(2);
  });
});
