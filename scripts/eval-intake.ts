/**
 * How well does Tend read what people are sent? Runs 20 real-looking inputs
 * (bills, receipts, scams including PayPal invoice and money-request scams,
 * and messages that only mention money)
 * through the reader and checks amount, category and scam risk.
 *
 *   npm run eval:intake             # Claude (needs ANTHROPIC_API_KEY)
 *   npm run eval:intake -- --offline  # the keyword reader used in demo mode
 *
 * Reads only: nothing is written to the database and nothing is paid.
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { extract } from "../src/lib/agent/intake";
import { heuristicExtract } from "../src/lib/agent/offline";
import type { Extraction } from "../src/lib/agent/schemas";

type Case = {
  name: string;
  source: "photo" | "voice" | "text";
  text?: string;
  image?: string;
  expect: { amount: number | null; category?: string; risky: boolean; payment?: boolean };
};

const CASES: Case[] = [
  { name: "Pharmacy receipt (photo)", source: "photo", image: "public/samples/pharmacy-receipt.png", expect: { amount: 24.5, category: "pharmacy", risky: false, payment: true } },
  { name: "Carer's invoice (photo)", source: "photo", image: "public/samples/carer-invoice.png", expect: { amount: 340, category: "carer", risky: false, payment: true } },
  { name: "Taxi, said out loud", source: "voice", text: "The taxi to my eye appointment was eighteen dollars. It was Bluebird.", expect: { amount: 18, category: "transport", risky: false, payment: true } },
  { name: "Prescription ready text", source: "text", text: "Riverside Pharmacy: your prescription RX-1050 is ready. $12.80 due on collection.", expect: { amount: 12.8, category: "pharmacy", risky: false, payment: true } },
  { name: "Electricity bill", source: "text", text: "Lone Star Energy: your October bill of $86.40 is due Nov 15. Account 44120.", expect: { amount: 86.4, category: "utilities", risky: false, payment: true } },
  { name: "Clinic co-pay", source: "text", text: "Westside Eye Clinic: appointment co-pay $25.00, ref WEC-221. Pay by PayPal to billing@westside-eye.example.", expect: { amount: 25, category: "clinic", risky: false, payment: true } },
  { name: "Carer's handwritten note", source: "text", text: "Grace - 6 hours this week at $17/h = $102. Thank you!", expect: { amount: 102, category: "carer", risky: false, payment: true } },
  { name: "Grandchild scam (gift cards)", source: "text", text: "Grandma its me, I lost my phone this is my new number. I'm in trouble and need $1,500 today for a lawyer. Please don't tell mum. Can you buy Apple gift cards and send me photos of the codes?", expect: { amount: 1500, risky: true } },
  { name: "IRS scam (Bitcoin)", source: "text", text: "This is the IRS. You owe $2,300 in back taxes. Pay today with Bitcoin at the machine on Main St or a warrant will be issued for your arrest. Do not tell anyone.", expect: { amount: 2300, risky: true } },
  { name: "Fake bank fraud team (wire)", source: "text", text: "This is your bank's fraud department. Your account is compromised. Move $4,000 to a safe account by wire transfer today. Do not discuss this with branch staff.", expect: { amount: 4000, risky: true } },
  { name: "Parcel redelivery fee", source: "text", text: "USPS: your package is held at our depot due to an unpaid fee. Pay $1.99 today at usps-redeliver-help.co or it will be returned.", expect: { amount: 1.99, risky: true } },
  { name: "Romance scam (Western Union)", source: "text", text: "My love, I am stuck at Dubai airport and customs want $800 before they release me. Please send it by Western Union tonight. Don't tell your children, they won't understand us.", expect: { amount: 800, risky: true } },
  { name: "Tech support scam", source: "text", text: "Microsoft Support: your computer has a virus. Call now and pay $299 with Google Play cards so our technician can fix it.", expect: { amount: 299, risky: true } },
  { name: "Church picnic (innocent)", source: "text", text: "Hi Mum, church picnic is on Sunday at 2. Bring the jollof!", expect: { amount: null, risky: false, payment: false } },
  { name: "Sibling mentions money (innocent)", source: "text", text: "Ada here - I put $100 in the pot this morning, nothing for you to do x", expect: { amount: null, risky: false, payment: false } },
  { name: "Grocery receipt, already paid", source: "text", text: "Kroger order #5521 delivered. Total $63.17 charged to your card on file. Thanks for shopping with us.", expect: { amount: null, risky: false, payment: false } },
  // Scams that run on PayPal itself, and other things older adults are sent.
  { name: "PayPal invoice, fake support number", source: "text", text: "PayPal: You have a new invoice from Geek Squad Total Protection for $499.99. Note from seller: If you did not authorize this renewal, call our billing desk at +1 (808) 555-0199 within 12 hours to cancel and get a refund.", expect: { amount: 499.99, risky: true } },
  { name: "PayPal money request, fake number", source: "text", text: "PayPal: Norton LifeLock sent you a request for $389.00. Your subscription renews today. To dispute this charge call +1 (844) 555-0142 immediately.", expect: { amount: 389, risky: true } },
  { name: "Medicare card fee", source: "text", text: "Medicare Card Services: your new card is ready. Pay the $89 replacement fee today to avoid losing coverage. Pay to renewals@medicare-card-help.example.com", expect: { amount: 89, risky: true } },
  { name: "Genuine PayPal receipt", source: "text", text: "PayPal: You sent $24.50 USD to Riverside Pharmacy. Transaction ID 7RX12345AB678. Thanks for using PayPal.", expect: { amount: null, risky: false, payment: false } },
];

const KNOWN = [
  { name: "Riverside Pharmacy", aliases: ["Riverside Rx"], kind: "pharmacy" },
  { name: "Grace Mensah", aliases: ["Grace", "Grace Home Care"], kind: "carer" },
  { name: "Bluebird Cabs", aliases: ["Bluebird"], kind: "transport" },
];

async function read(c: Case, offline: boolean): Promise<Extraction> {
  if (offline) return heuristicExtract(c.text ?? "", KNOWN, "USD");
  const imageDataUrl = c.image ? `data:image/png;base64,${fs.readFileSync(path.resolve(c.image)).toString("base64")}` : null;
  return extract({ source: c.source, text: c.text, imageDataUrl, careRecipientName: "Mum", knownPayees: KNOWN.map((k) => k.name), currency: "USD" });
}

async function main() {
  const offline = process.argv.includes("--offline");
  if (!offline && !process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY, or run with --offline to score the demo-mode reader.");
    process.exit(1);
  }
  const rows: string[][] = [];
  let pass = 0;
  let checks = 0;
  for (const c of CASES) {
    if (offline && c.image) {
      rows.push([c.name, "skipped (photos need Claude)", "", "", ""]);
      continue;
    }
    const e = await read(c, offline);
    const risky = e.scam.riskScore >= 0.4;
    const okRisk = risky === c.expect.risky;
    const okAmount = c.expect.payment === false ? !e.isPaymentRequest || e.amount === null : e.amount !== null && Math.abs(e.amount - (c.expect.amount ?? 0)) < 0.005;
    const okCat = !c.expect.category || e.category === c.expect.category;
    const ok = okRisk && okAmount && okCat;
    pass += Number(ok);
    checks++;
    rows.push([
      c.name,
      e.amount === null ? "—" : `$${e.amount.toFixed(2)}`,
      e.category,
      `${Math.round(e.scam.riskScore * 100)}%`,
      ok ? "✓" : `✗ ${[!okAmount && "amount", !okCat && "category", !okRisk && "risk"].filter(Boolean).join(", ")}`,
    ]);
  }
  const head = ["Input", "Amount", "Category", "Scam risk", "Result"];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => `| ${r.map((x, i) => x.padEnd(widths[i])).join(" | ")} |`;
  console.log(`\nTend intake eval (${offline ? "offline keyword reader" : process.env.TEND_MODEL || "claude-sonnet-5-5"})\n`);
  console.log(line(head));
  console.log(`| ${widths.map((w) => "-".repeat(w)).join(" | ")} |`);
  for (const r of rows) console.log(line(r));
  console.log(`\n${pass}/${checks} correct. "Scam risk" ≥ 40% means Tend asks the family; ≥ 75% means it refuses.\n`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
