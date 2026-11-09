import type { Metadata } from "next";
import { settleDueHolds } from "@/lib/own-payments";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { activeMandate, listPayees } from "@/lib/circle";
import { holdFor } from "@/lib/time";
import { familyContext, personProps } from "@/lib/page-context";
import { PersonScreen, type PersonRecent, type Sample } from "@/components/person-screen";
import { formatMoney } from "@/lib/money";
import { joinNames } from "@/lib/people";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My screen" };

const when = new Intl.DateTimeFormat("en-US", { weekday: "long", day: "numeric", month: "long" });

const PAYPAL_INVOICE_SCAM =
  "PayPal: You have a new invoice from Geek Squad Total Protection for $499.99. Note from seller: Your annual renewal has been processed. If you did not authorize this, call our billing desk at +1 (808) 555-0199 within 12 hours to cancel and get a refund.";

function samplesFor(potEnabled: boolean, name: string): Sample[] {
  const shared: Sample[] = [
    { id: "paypal-invoice", label: "A PayPal invoice email", route: potEnabled ? "pot" : "own", kind: "text", text: PAYPAL_INVOICE_SCAM },
    {
      id: "scam-text",
      label: "A worrying text",
      route: potEnabled ? "pot" : "own",
      kind: "text",
      text: `${name === "Mum" ? "Grandma" : "Grandpa"} its me, I lost my phone this is my new number. I'm in trouble and need $1,500 today for a lawyer. Please don't tell anyone, they'll be so angry. Can you buy Apple gift cards and send me photos of the codes? I'll pay you back I promise x`,
    },
  ];
  if (potEnabled) {
    return [
      { id: "pharmacy-receipt", label: "Pharmacy receipt", route: "pot", kind: "image", src: "/samples/pharmacy-receipt.png" },
      { id: "carer-invoice", label: "Carer's invoice", route: "pot", kind: "image", src: "/samples/carer-invoice.png" },
      { id: "taxi-voice", label: "Taxi, said out loud", route: "pot", kind: "voice", text: "The taxi to my eye appointment was eighteen dollars. It was Bluebird." },
      ...shared,
      { id: "roofer-own", label: "Pay the roofer myself", route: "own", kind: "text", text: "Ridgeline Roofing says the storm damaged the roof. They want a $650 deposit today to get on the schedule. Pay to jobs@ridgeline-roof.example.com" },
    ];
  }
  return [
    { id: "refill-own", label: "Pharmacy refill", route: "own", kind: "text", text: "Saguaro Pharmacy refill ready, heart tablets, $38.20, ref SR-2360." },
    { id: "roofer-own", label: "A roofer at the door", route: "own", kind: "voice", text: "A man from Ridgeline Roofing knocked. He says the storm damaged my roof and needs a $650 deposit today. Pay to jobs@ridgeline-roof.example.com" },
    { id: "medicare-own", label: "A Medicare card fee", route: "own", kind: "text", text: "Medicare Card Services: your new card is ready. Pay the $89 replacement fee today to avoid losing coverage. Pay to renewals@medicare-card-help.example.com" },
    ...shared,
  ];
}

export default async function PersonPage({ searchParams }: { searchParams: Promise<{ vault?: string }> }) {
  const { vault } = await searchParams;
  // Holds whose time is up go (or lapse) now, even without the cron job.
  await settleDueHolds().catch(() => undefined);
  const ctx = await familyContext({ forPerson: true });
  const person = ctx.mum;
  if (!person) return <p className="p-8">This circle has no one at the centre yet.</p>;
  const db = await getDb();
  // What they sent in (photos, voice, messages), newest first. Not what the circle set up for them.
  const rows = await db
    .select({ intent: schema.paymentIntents })
    .from(schema.paymentIntents)
    .innerJoin(schema.intakes, eq(schema.intakes.id, schema.paymentIntents.intakeId))
    .where(and(eq(schema.paymentIntents.circleId, ctx.circle.id), or(eq(schema.intakes.submittedBy, person.id), isNull(schema.intakes.submittedBy))))
    .orderBy(desc(schema.paymentIntents.createdAt))
    .limit(4);
  const intents = rows.map((r) => r.intent);
  const votes = intents.length ? await db.select().from(schema.approvals).where(inArray(schema.approvals.intentId, intents.map((i) => i.id))) : [];
  const name = (id: string | null) => ctx.members.find((m) => m.id === id)?.name ?? "someone";

  const recent: PersonRecent[] = intents.map((i) => {
    const amount = formatMoney(i.amountMinor, i.currency);
    const approvedBy = votes.filter((v) => v.intentId === i.id && v.verdict === "approve").map((v) => name(v.memberId));
    const line =
      i.status === "paid"
        ? `Paid ${i.payeeName} ${amount}`
        : i.status === "refused"
          ? `Didn't pay ${amount}: it looked like a scam`
          : i.status === "held"
            ? `${i.payeeName} ${amount}: held, your money hasn't left`
            : i.status === "voided"
              ? `${i.payeeName} ${amount}: stopped by ${name(i.stoppedBy)}, your money never left`
              : i.status === "awaiting_approval"
                ? `${i.payeeName} ${amount}: asked your circle${approvedBy.length ? `, ${joinNames(approvedBy)} said yes` : ""}`
                : i.status === "on_hold"
                  ? `${i.payeeName} ${amount}: waiting for a top-up`
                  : i.status === "rejected"
                    ? `Your circle said no to ${i.payeeName}`
                    : `${i.payeeName} ${amount}: ${i.status.replace("_", " ")}`;
    const tone: PersonRecent["tone"] =
      i.status === "paid" ? "paid" : i.status === "refused" || i.status === "failed" ? "stop" : i.status === "rejected" || i.status === "voided" ? "quiet" : "wait";
    return { id: i.id, line, tone, when: when.format(i.createdAt) };
  });

  const regular = (await listPayees(ctx.circle.id)).filter((p) => p.verified && (p.kind === "pharmacy" || p.kind === "utilities"));
  const saved = Boolean(person.vaultTokenId && !person.vaultTokenId.startsWith("pending:"));
  const consented = regular.filter((p) => person.vaultConsent?.payeeIds.includes(p.id));
  const summary = saved
    ? `I can pay ${consented.map((p) => p.name).join(" and ")} from your PayPal, up to ${formatMoney(person.vaultConsent?.maxPerPaymentMinor ?? 0, ctx.circle.currency)} a time, without asking you each time. Your circle's rules still apply.`
    : null;

  return (
    <PersonScreen
      memberId={person.id}
      name={ctx.circle.careRecipientName}
      circle={ctx.family.map((m) => ({ ...personProps(m), relation: m.relation }))}
      recent={recent}
      samples={ctx.example ? samplesFor(ctx.circle.potEnabled, ctx.circle.careRecipientName) : []}
      initialNow={ctx.now}
      demo={ctx.demo.paypal}
      paypalMode={ctx.integrations.paypal}
      currency={ctx.circle.currency}
      potEnabled={ctx.circle.potEnabled}
      hold={holdFor((await activeMandate(ctx.circle.id)).ownPayments?.coolingOffHours ?? 24)}
      vault={{ saved, summary, payees: regular.map((p) => ({ id: p.id, name: p.name })) }}
      vaultNotice={vault === "saved" ? "Saved. I'll pay your regular bills from your PayPal." : vault === "failed" ? "That didn't save. Nothing changed." : null}
    />
  );
}
