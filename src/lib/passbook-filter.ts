import { z } from "zod";
import { CATEGORIES } from "./mandate/types";

/**
 * "Pharmacy payments over $20 since October" → a structured filter the
 * passbook grid applies. The model only describes a filter; it never sees
 * or changes money. Shown back to the family as chips they can remove.
 */

export const PASSBOOK_TYPES = ["contribution", "payment", "refund", "verification", "own"] as const;
export const PASSBOOK_CATEGORIES = [...CATEGORIES, "top-up", "refund", "verification"] as const;

export const PassbookQuerySchema = z.object({
  people: z.array(z.string()).describe("Family member names to match in the 'who' column. Empty for everyone."),
  categories: z.array(z.enum(PASSBOOK_CATEGORIES)).describe("Empty for all categories."),
  types: z.array(z.enum(PASSBOOK_TYPES)).describe("contribution = money in from the circle, payment = paid from the pot, refund = money back, own = paid (or held, stopped, refused) from the person's own PayPal. Empty for all."),
  statuses: z.array(z.enum(["paid", "held", "stopped", "refused", "in", "refunded"])).nullish().describe("Only rows with these statuses, e.g. stopped and refused for 'what did we stop'. Null for all."),
  payee: z.string().nullable().describe("Part of a payee name, e.g. 'Riverside'. Null if not asked."),
  minAmount: z.number().nullable().describe("Dollars. Matches either money in or money out."),
  maxAmount: z.number().nullable(),
  from: z.string().nullable().describe("YYYY-MM-DD inclusive"),
  to: z.string().nullable().describe("YYYY-MM-DD inclusive"),
  sort: z.enum(["newest", "oldest", "largest", "smallest"]).nullable(),
  summary: z.string().describe("Six words or fewer describing the filter, e.g. 'Pharmacy payments over $20'."),
});
export type PassbookQuery = z.infer<typeof PassbookQuerySchema>;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function parsePassbookQuestion(q: string, people: string[], today = new Date()): PassbookQuery {
  const t = q.toLowerCase();
  const out: PassbookQuery = { people: [], categories: [], types: [], statuses: null, payee: null, minAmount: null, maxAmount: null, from: null, to: null, sort: null, summary: q.slice(0, 40) };
  if (/stopped|refused|blocked|scam|kept/.test(t)) out.statuses = ["stopped", "refused"];
  else if (/\bheld\b|on hold|holding/.test(t)) out.statuses = ["held"];
  out.people = people.filter((p) => t.includes(p.toLowerCase()));
  for (const c of CATEGORIES) if (t.includes(c)) out.categories.push(c);
  if (/taxi|cab/.test(t) && !out.categories.includes("transport")) out.categories.push("transport");
  if (/top.?ups?|put in|contribut|paid in|shares?/.test(t)) out.types.push("contribution");
  if (/refund|paid back|money back/.test(t)) out.types.push("refund");
  if (/payments?|paid out|spent|spend/.test(t) && !out.types.length) out.types.push("payment");
  const over = t.match(/(?:over|above|more than|at least)\s*\$?(\d+(?:\.\d+)?)/);
  if (over) out.minAmount = Number(over[1]);
  const under = t.match(/(?:under|below|less than)\s*\$?(\d+(?:\.\d+)?)/);
  if (under) out.maxAmount = Number(under[1]);
  if (/this month/.test(t)) out.from = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  else if (/last month/.test(t)) {
    out.from = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
    out.to = iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)));
  } else if (/last (\d+) days|past (\d+) days/.test(t)) {
    const n = Number(t.match(/(\d+) days/)![1]);
    out.from = iso(new Date(today.getTime() - n * 864e5));
  } else if (/(?:last|past) week/.test(t)) out.from = iso(new Date(today.getTime() - 7 * 864e5));
  else {
    const m = MONTHS.findIndex((x) => t.includes(x));
    if (m >= 0) {
      const year = m > today.getUTCMonth() ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
      const since = /since|from|after/.test(t);
      out.from = iso(new Date(Date.UTC(year, m, 1)));
      if (!since) out.to = iso(new Date(Date.UTC(year, m + 1, 0)));
    }
  }
  if (/biggest|largest|most/.test(t)) out.sort = "largest";
  else if (/smallest|least/.test(t)) out.sort = "smallest";
  else if (/oldest|first/.test(t)) out.sort = "oldest";
  const payee = q.match(/(?:to|from)\s+([A-Z][\w]+(?:\s[A-Z][\w]+)?)/);
  if (payee && !people.includes(payee[1])) out.payee = payee[1];
  const bits = [
    out.categories.join(" & ") || (out.types[0] === "contribution" ? "top-ups" : out.types[0] === "refund" ? "refunds" : "entries"),
    out.people.length ? `by ${out.people.join(" & ")}` : "",
    out.minAmount !== null ? `over $${out.minAmount}` : "",
    out.maxAmount !== null ? `under $${out.maxAmount}` : "",
  ].filter(Boolean);
  out.summary = bits.join(" ");
  return out;
}

/** Applied on the client by the grid's external filter; also unit-tested. */
export function rowMatches(
  row: { who: string; category: string; type: string; status?: string; payee: string | null; description: string; inMinor: number; outMinor: number; at: string },
  q: PassbookQuery,
): boolean {
  if (q.statuses?.length && !q.statuses.includes((row.status ?? "") as never)) return false;
  if (q.people.length && !q.people.some((p) => row.who.toLowerCase().includes(p.toLowerCase()) || row.description.toLowerCase().startsWith(p.toLowerCase()))) return false;
  if (q.categories.length && !q.categories.includes(row.category as (typeof PASSBOOK_CATEGORIES)[number])) return false;
  if (q.types.length && !q.types.includes(row.type as (typeof PASSBOOK_TYPES)[number])) return false;
  if (q.payee && !(row.payee ?? row.description).toLowerCase().includes(q.payee.toLowerCase())) return false;
  const amount = (row.inMinor || row.outMinor) / 100;
  if (q.minAmount !== null && amount < q.minAmount) return false;
  if (q.maxAmount !== null && amount > q.maxAmount) return false;
  const day = row.at.slice(0, 10);
  if (q.from && day < q.from) return false;
  if (q.to && day > q.to) return false;
  return true;
}
