import { z } from "zod";
import { getDb, schema } from "./db/client";
import { DEFAULT_MANDATE } from "./mandate/defaults";
import type { Mandate } from "./mandate/types";
import { appCurrency } from "./money";

/**
 * Setting Tend up for someone: the person at the centre, the people who are
 * their second key, and how careful Tend should be. It makes a circle like
 * Walter's: their own PayPal, no shared pot, the circle's rules from day one.
 */

const Person = z.object({
  name: z.string().trim().min(1, "Add a name").max(40),
  city: z.string().trim().min(1, "Add where they live").max(60),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Pick a time zone"),
});

export const NewCircle = z.object({
  person: Person,
  helpers: z
    .array(Person.extend({ relation: z.string().trim().min(1).max(30) }))
    .min(1, "Add at least one person")
    .max(4),
  rules: z.object({
    coolingOffHours: z.union([z.literal(12), z.literal(24), z.literal(48), z.literal(71)]),
    coolOffOver: z.number().min(0).max(10_000),
    approvalOver: z.number().min(0).max(100_000),
    holdNewPayees: z.boolean(),
  }),
});
export type NewCircle = z.infer<typeof NewCircle>;

// Brass is the person at the centre's, as on every circle; helpers take the next free colours.
const HELPER_COLOURS = ["teal", "rust", "cobalt", "violet"] as const;

// Everyone joins by their own link, so no address is collected; .invalid can never receive mail.
const noEmail = (name: string) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.${crypto.randomUUID().slice(0, 8)}@members.tend.invalid`;

export async function createCircle(input: NewCircle) {
  const db = await getDb();
  const currency = appCurrency();
  const [circle] = await db
    .insert(schema.circles)
    .values({ name: `${input.person.name}'s circle`, careRecipientName: input.person.name, currency, potEnabled: false })
    .returning();
  const [person, ...helpers] = await db
    .insert(schema.members)
    .values([
      { circleId: circle.id, name: input.person.name, email: noEmail(input.person.name), role: "care_recipient", city: input.person.city, timezone: input.person.timezone, color: "brass", homeCurrency: currency },
      ...input.helpers.map((h, n) => ({
        circleId: circle.id,
        name: h.name,
        email: noEmail(h.name),
        role: n === 0 ? ("owner" as const) : ("sibling" as const),
        relation: h.relation.toLowerCase(),
        city: h.city,
        timezone: h.timezone,
        color: HELPER_COLOURS[n],
        homeCurrency: currency,
      })),
    ])
    .returning();
  const rules: Mandate = {
    ...DEFAULT_MANDATE,
    largePaymentApprovals: 1,
    defaultApprovals: 1,
    ownPayments: {
      coolingOffHours: input.rules.coolingOffHours,
      coolOffOverMinor: Math.round(input.rules.coolOffOver * 100),
      approvalOverMinor: Math.round(Math.max(input.rules.approvalOver, input.rules.coolOffOver) * 100),
      holdNewPayees: input.rules.holdNewPayees,
    },
  };
  await db.insert(schema.mandates).values({ circleId: circle.id, version: 1, rules, createdBy: helpers[0].id });
  await db.insert(schema.auditEvents).values({ circleId: circle.id, actor: `member:${helpers[0].id}`, type: "circle_created", data: { helpers: helpers.map((h) => h.name) } });
  return { circle, person, helpers };
}
