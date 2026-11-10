/**
 * Puts the demo circle into an interesting state without calling the model
 * or PayPal: a carer invoice waiting for two approvals, and a refused scam.
 *
 *   npm run demo:scenario
 */
import "./load-env";
import { handleIntake } from "../src/lib/agent/pipeline";
import type { Extraction } from "../src/lib/agent/schemas";

const base: Extraction = {
  kind: "invoice",
  isPaymentRequest: true,
  payeeName: "Grace Home Care",
  payeeEmail: null,
  amount: 340,
  currency: process.env.CURRENCY || "USD",
  category: "carer",
  method: "paypal",
  reference: "INV-77",
  dueDate: null,
  summary: "Grace's home care visits for the last two weeks.",
  scam: { impersonation: false, urgency: false, secrecy: false, unusualMethod: false, unsolicited: false, riskScore: 0.02, explanation: "Regular carer invoice." },
  confidence: 0.96,
};

async function main() {
  const a = await handleIntake({ source: "photo", preExtracted: base });
  console.log("Carer invoice:", a.outcome);
  const b = await handleIntake({
    source: "text",
    text: "Grandma its me, I lost my phone... buy Apple gift cards and send me the codes. Don't tell mum.",
    preExtracted: {
      ...base,
      kind: "payment_request",
      payeeName: "Unknown number claiming to be her grandson",
      amount: 1500,
      category: "other",
      method: "gift_card",
      reference: null,
      summary: "Someone saying they're Mum's grandson and asking for gift cards.",
      scam: {
        impersonation: true,
        urgency: true,
        secrecy: true,
        unusualMethod: true,
        unsolicited: true,
        riskScore: 0.97,
        explanation: "Classic grandparent scam: a new number, urgency, secrecy and gift cards.",
      },
    },
  });
  console.log("Scam text:", b.outcome);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
