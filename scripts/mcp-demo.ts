/**
 * Talks to Tend's MCP server the way Claude would, and prints what it hears.
 *
 *   npm run dev                      (in another terminal)
 *   npm run mcp:demo                 → http://localhost:3000/api/mcp
 *   TEND_URL=https://tend.onrender.com npm run mcp:demo
 *
 * Read-only: it checks three messages Walter might be sent and lists what's held.
 */
import "./load-env";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const base = (process.env.TEND_URL ?? "http://localhost:3000").replace(/\/$/, "");
const token = process.env.TEND_MCP_TOKEN;

const client = new Client({ name: "tend-mcp-demo", version: "1.0.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(`${base}/api/mcp`), token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : undefined),
);

const { tools } = await client.listTools();
console.log(`Connected to ${base}/api/mcp: ${tools.map((t) => t.name).join(", ")}\n`);

async function call(name: string, args: Record<string, unknown>) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { type: string; text: string }[])[0]?.text ?? "";
  if (r.isError) throw new Error(text);
  return JSON.parse(text);
}

const messages = [
  "Saguaro Pharmacy refill ready, heart tablets, $38.20, ref SR-2361.",
  "A man from Ridgeline Roofing knocked. He says the storm damaged my roof and needs a $650 deposit today. Pay to jobs@ridgeline-roof.example.com",
  "PayPal: You have a new invoice from Norton Security for $389.00. If you did not authorize this, call +1 (844) 555-0142 to cancel and get a refund.",
];
for (const text of messages) {
  const r = await call("check_payment_request", { circle: "Walter", text });
  console.log(`“${text.slice(0, 72)}${text.length > 72 ? "…" : ""}”`);
  console.log(`  → ${r.decision}: ${r.whatHappens}`);
  for (const why of r.reasons) console.log(`    · ${why}`);
  console.log();
}

const held = await call("list_held_payments", { circle: "Walter" });
console.log(held.length ? `Held right now: ${held.map((h: { amount: string; payee: string }) => `${h.amount} to ${h.payee}`).join(", ")}` : "Nothing is held right now.");
await client.close();
