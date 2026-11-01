import type { Extraction } from "./schemas";
import type { Category, PaymentMethod } from "../mandate/types";
import { CATEGORIES } from "../mandate/types";
import { categoryLabel, type RuleProposal } from "../mandate/edit";

/**
 * Demo mode without an Anthropic key.
 *
 * Tend's real reader is Claude. When no key is configured these stand-ins
 * keep the app usable: the sample documents have known readings, and typed
 * or spoken text goes through a conservative keyword reader. Every result is
 * marked "read without AI" so nobody mistakes it for the model.
 */

export const OFFLINE_NOTE = "Read without AI (demo mode).";

export const SAMPLES = {
  "pharmacy-receipt": {
    kind: "prescription",
    isPaymentRequest: true,
    payeeName: "Riverside Pharmacy",
    payeeEmail: "pay@riversiderx.example",
    amount: 24.5,
    currency: "USD",
    category: "pharmacy",
    method: "paypal",
    reference: "RX-1042",
    dueDate: "2026-11-04",
    summary: "Your blood pressure and cholesterol tablets from Riverside Pharmacy.",
    scam: { impersonation: false, urgency: false, secrecy: false, unusualMethod: false, unsolicited: false, riskScore: 0.03, explanation: `A normal pharmacy receipt with a prescription number. ${OFFLINE_NOTE}` },
    confidence: 0.97,
  },
  "carer-invoice": {
    kind: "invoice",
    isPaymentRequest: true,
    payeeName: "Grace Home Care",
    payeeEmail: "grace@gracehomecare.example",
    amount: 340,
    currency: "USD",
    category: "carer",
    method: "paypal",
    reference: "INV-77",
    dueDate: "2026-11-13",
    summary: "Grace's home care visits for the last two weeks.",
    scam: { impersonation: false, urgency: false, secrecy: false, unusualMethod: false, unsolicited: false, riskScore: 0.02, explanation: `A regular invoice from Mum's carer. ${OFFLINE_NOTE}` },
    confidence: 0.96,
  },
} satisfies Record<string, Extraction>;

export type SampleId = keyof typeof SAMPLES;
export const isSampleId = (s: unknown): s is SampleId => typeof s === "string" && s in SAMPLES;

// --- Keyword reader -------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

export function findAmount(text: string): number | null {
  // A stated total wins over line items: "6 hours at $17/h = $102".
  const total = text.match(/(?:=|total(?: due)?:?)\s*(?:\$|USD\s?|£|€)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/i);
  if (total) return Number(total[1].replace(/,/g, "")) + (total[2] ? Number(total[2].padEnd(2, "0")) / 100 : 0);
  const sym = text.match(/(?:\$|USD\s?|£|€)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/i);
  if (sym) return Number(sym[1].replace(/,/g, "")) + (sym[2] ? Number(sym[2].padEnd(2, "0")) / 100 : 0);
  const trail = text.match(/(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(?:dollars|usd|bucks)/i);
  if (trail) return Number(trail[1].replace(/,/g, "")) + (trail[2] ? Number(trail[2].padEnd(2, "0")) / 100 : 0);
  const words = text.toLowerCase().match(/((?:[a-z]+[\s-]?){1,4})\s(?:dollars|bucks)/);
  if (words) {
    let total = 0;
    let current = 0;
    for (const w of words[1].split(/[\s-]+/)) {
      const n = NUMBER_WORDS[w];
      if (n === undefined) continue;
      if (n === 100) current = (current || 1) * 100;
      else current += n;
    }
    total += current;
    return total > 0 ? total : null;
  }
  return null;
}

const CATEGORY_WORDS: [Category, RegExp][] = [
  ["pharmacy", /pharmac|prescription|tablets|medicine|chemist|\brx\b/i],
  ["transport", /taxi|cab\b|uber|lyft|ride|bus fare/i],
  ["carer", /carer|caregiver|home care|care visits|nurse aide/i],
  ["clinic", /clinic|doctor|dentist|dental|optician|appointment fee|hospital|check-?up/i],
  ["utilities", /electric|gas bill|water bill|energy|utility|phone bill|internet/i],
  ["groceries", /grocer|supermarket|food shop|walmart|kroger/i],
  ["equipment", /walker|wheelchair|shower chair|grab rail|hearing aid|equipment/i],
];

const METHOD_WORDS: [PaymentMethod, RegExp][] = [
  ["gift_card", /gift ?cards?|itunes|apple cards?|google play cards?|steam cards?|vouchers? codes?/i],
  ["crypto", /bitcoin|crypto|usdt|ethereum|btc\b/i],
  ["wire", /wire (?:transfer|the money)|western union|moneygram/i],
  ["cash_courier", /courier|send someone to collect|cash collection|collect (?:the )?cash/i],
  ["bank_transfer", /bank transfer|sort code|routing number|account number/i],
];

export function heuristicExtract(text: string, knownPayees: { name: string; aliases: string[]; kind?: string }[], currency: string): Extraction {
  const t = text.trim();
  const amount = findAmount(t);
  const payee = knownPayees.find((p) => [p.name, ...p.aliases].some((n) => n.length > 3 && t.toLowerCase().includes(n.toLowerCase())));
  const kind = payee?.kind && (CATEGORIES as readonly string[]).includes(payee.kind) ? (payee.kind as Category) : null;
  const category = kind ?? CATEGORY_WORDS.find(([, re]) => re.test(t))?.[0] ?? "other";
  const method = METHOD_WORDS.find(([, re]) => re.test(t))?.[0] ?? "paypal";

  // PayPal's own rails used against them: a real invoice/money request with a fake support number.
  const viaPayPal = /paypal/i.test(t) && /(invoice|money request|requested \$|request for payment|sent you a request|payment request)/i.test(t);
  const phone = t.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] ?? null;
  const callToAct = /\b(call|phone|ring|contact)\b.*\b(dispute|cancel|refund|support|help ?desk|billing|within)\b|\b(dispute|cancel|refund)\b.*\b(call|phone)\b/i.test(t);
  const phoneInNote = viaPayPal && phone && callToAct ? phone : null;
  const impersonation = Boolean(phoneInNote) || /(grand(?:ma|pa|mother|father|son|daughter)|it'?s me|new number|this is your bank|fraud department|irs\b|hmrc|police|social security|medicare|medicaid|microsoft|apple support|amazon security|geek squad|norton|mcafee|usps|fedex|\bdhl\b|royal mail|parcel force)/i.test(t);
  const urgency = /\b(today|right now|immediately|urgent|asap|within (?:24|48) hours|or else|arrest|suspended|final notice|avoid losing|lose (?:your )?(?:coverage|benefits))\b/i.test(t);
  // Medicare, Social Security and the IRS never charge a fee to replace a card.
  const agencyFee = /(medicare|medicaid|social security|\birs\b)/i.test(t) && /\b(fee|charge|pay)\b/i.test(t);
  // Storm-chasers: a stranger at the door wanting money up front. Could be real, so the circle checks.
  const doorstep = /(knocked|at (?:my|the) door|on my doorstep|door[- ]to[- ]door|came (?:round|by)|storm (?:damage|damaged))/i.test(t) && /\b(deposit|up ?front|today|cash)\b/i.test(t);
  const secrecy = /(don'?t tell|do not tell|keep (?:this|it) (?:between us|secret|quiet)|secret)/i.test(t);
  const unusualMethod = method !== "paypal" && method !== "bank_transfer";
  const unsolicited = impersonation || doorstep || /(you(?:'ve| have)? won|prize|lottery|claim your|refund owed|inheritance|package is held|redelivery fee|unpaid fee)/i.test(t);
  const riskScore = phoneInNote
    ? 0.96
    : Math.min(0.99, (impersonation ? 0.3 : 0) + (agencyFee ? 0.25 : 0) + (doorstep ? 0.2 : 0) + (urgency ? 0.15 : 0) + (secrecy ? 0.25 : 0) + (unusualMethod ? 0.35 : 0) + (unsolicited ? 0.1 : 0));
  const signals = [
    phoneInNote && `a real PayPal ${/money request|sent you a request/i.test(t) ? "money request" : "invoice"} with a phone number to call (${phoneInNote}); PayPal never puts support numbers in invoice notes`,
    agencyFee && "a government agency asking for a fee; Medicare, Social Security and the IRS never charge to replace a card",
    impersonation && !phoneInNote && !agencyFee && "someone claiming to be family or an official",
    doorstep && "a stranger at the door asking for money up front",
    urgency && "pressure to pay right now",
    secrecy && "asks to keep it secret",
    unusualMethod && "an unusual way to pay",
  ].filter(Boolean) as string[];

  const alreadyPaid = /(charged to your card|already paid|has been paid|paid in full|thanks for shopping|you sent \$|you paid \$|payment sent to)/i.test(t);
  const asksToPay = !alreadyPaid && /\b(pay|owe|bill|invoice|due|fee)\b/i.test(t);
  const isPaymentRequest = amount !== null && !alreadyPaid && (riskScore >= 0.4 || payee !== undefined || category !== "other" || asksToPay);
  const payTo = t.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null;
  // "…pay $45 to Riverside Dental" → an unknown payee the family can add.
  const named = t.match(/\b(?:to|from)\s+([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3})/)?.[1];
  // "You have a new invoice from Geek Squad Total Protection for $499.99"
  const invoiceFrom = viaPayPal ? t.match(/(?:invoice|request) from ([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,4})/)?.[1] : undefined;
  // "Medicare Card Services: your new card is ready…" names who it claims to be from.
  const sender = t.match(/^([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,4}):\s/)?.[1];
  const payeeName = payee?.name ?? invoiceFrom ?? (sender && sender !== "PayPal" ? sender : undefined) ?? (impersonation ? "Unknown sender" : named ?? "");
  return {
    kind: riskScore >= 0.4 ? "payment_request" : isPaymentRequest ? "bill" : "message",
    isPaymentRequest,
    payeeName,
    payeeEmail: payTo && !phoneInNote ? payTo : null,
    amount,
    currency,
    category,
    method,
    reference: t.match(/\b(?:RX|INV|REF|T)-?\d{2,}\b/i)?.[0]?.toUpperCase() ?? null,
    dueDate: null,
    summary: summarise({ amount, payeeName, category, risky: riskScore >= 0.4, currency }) || `“${t.length > 70 ? `${t.slice(0, 70).trimEnd()}…` : t}”`,
    scam: {
      impersonation,
      urgency,
      secrecy,
      unusualMethod,
      unsolicited,
      riskScore,
      explanation: signals.length
        ? `Warning signs: ${signals.join(", ")}. ${OFFLINE_NOTE}`
        : `Nothing unusual in the wording. ${OFFLINE_NOTE}`,
    },
    confidence: payee && amount !== null ? 0.7 : 0.4,
    paypalNative: viaPayPal ? { kind: /money request|sent you a request/i.test(t) ? "money_request" : "invoice", phoneInNote } : null,
  };
}

function summarise(o: { amount: number | null; payeeName: string; category: Category; risky: boolean; currency: string }) {
  const money = o.amount === null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: o.currency }).format(o.amount);
  if (o.risky) return `Someone is asking you for ${money || "money"} in a way that looks like a scam.`;
  if (o.payeeName && money) return o.category === "other" ? `${money} for ${o.payeeName}.` : `${money} for ${o.payeeName} (${categoryLabel(o.category).toLowerCase()}).`;
  if (money) return `A request for ${money}.`;
  return "";
}

// --- Rules in plain English, without AI -----------------------------------------

const CAT_RE = new RegExp(`\\b(${CATEGORIES.join("|")}|taxi|taxis|cabs?|carers?|pharmacies|medicine|prescriptions)\\b`, "i");
const CAT_ALIAS: Record<string, Category> = {
  taxi: "transport", taxis: "transport", cab: "transport", cabs: "transport", carers: "carer",
  pharmacies: "pharmacy", medicine: "pharmacy", prescriptions: "pharmacy",
};
const COUNT: Record<string, number> = { one: 1, two: 2, three: 3, "1": 1, "2": 2, "3": 3 };

export function parseRuleRequestOffline(text: string): RuleProposal {
  const t = text.toLowerCase();
  const changes: RuleProposal["changes"] = [];
  const money = t.match(/\$?\s?(\d+(?:\.\d+)?)/);
  const cat = t.match(CAT_RE)?.[1];
  const category = cat ? (CAT_ALIAS[cat] ?? (cat as Category)) : null;

  const hours = t.match(/(\d+)\s*(?:hours?|hrs?)\b/) ?? (/(\d+)\s*days?\b/.test(t) ? [null, String(Number(t.match(/(\d+)\s*days?\b/)![1]) * 24)] : null);
  // "Hold anything over $200 for 2 days" sets both.
  const holdOver = t.match(/(?:over|above)\s*\$?\s?(\d+(?:\.\d+)?)/);
  if (/\bhold\b/.test(t) && (hours || holdOver)) {
    if (hours) changes.push({ path: "ownPayments.coolingOffHours", value: Math.min(71, Number(hours[1])) });
    if (holdOver) changes.push({ path: "ownPayments.coolOffOverMinor", value: Number(holdOver[1]) });
  } else if (/large|big/.test(t) && /approv|people|sign/.test(t)) {
    const n = t.match(/\b(one|two|three|1|2|3)\b/)?.[1];
    if (n) changes.push({ path: "largePaymentApprovals", value: COUNT[n] });
  } else if (/large|big/.test(t) && money) {
    changes.push({ path: "largePaymentOverMinor", value: Number(money[1]) });
  } else if (category && /budget/.test(t) && money) {
    changes.push({ path: `categories.${category}.monthlyBudgetMinor`, value: Number(money[1]) });
  } else if (category && /always ask|never auto|stop auto/.test(t)) {
    changes.push({ path: `categories.${category}.autoPayUpToMinor`, value: 0 });
  } else if (category && money) {
    changes.push({ path: `categories.${category}.autoPayUpToMinor`, value: Number(money[1]) });
  }
  const method = t.match(/\b(block|allow|unblock|stop)\b.*\b(bank transfers?|crypto|wire|courier)/);
  if (method) {
    const key = method[2].startsWith("bank") ? "bank_transfer" : method[2].startsWith("courier") ? "cash_courier" : method[2];
    changes.push({ path: `blockedMethods.${key}`, value: method[1] === "block" || method[1] === "stop" });
  }
  return {
    understood: changes.length > 0,
    changes,
    reply: changes.length
      ? "Here's the change I understood. Check it before saving."
      : "I couldn't turn that into a rule change without AI. Try something like \"let pharmacy auto-pay up to $80\", or edit the rule directly.",
  };
}
