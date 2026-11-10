/**
 * Seeds the two demo circles, with history:
 *   - the Okafor family: Mum in Houston, her children in London, Toronto and Lagos, a shared care pot
 *   - Walter's circle: Walter, 84, no children; his niece in Seattle and his neighbour next door
 *
 *   npm run db:seed          create if empty
 *   npm run db:reset         wipe and recreate
 *
 * Payouts in sandbox go to the payee emails. Create matching *Personal* sandbox
 * accounts at developer.paypal.com → Testing tools → Sandbox accounts so you
 * can log in and watch the money arrive, then put their emails in .env
 * (SANDBOX_PHARMACY_EMAIL, SANDBOX_CARER_EMAIL, SANDBOX_TAXI_EMAIL,
 *  SANDBOX_ADA_EMAIL, SANDBOX_TUNDE_EMAIL, SANDBOX_CHIOMA_EMAIL).
 */
import "./load-env";
import { sql } from "drizzle-orm";
import { getDb, schema } from "../src/lib/db/client";
import { seedAll, seedDemo } from "../src/lib/db/seed-demo";
import { scanForDuplicates } from "../src/lib/recoveries";
import { examplesOn } from "../src/lib/examples";

async function main() {
  // Live PayPal, or TEND_EXAMPLES=0: no made-up people, and never wipe the real circles.
  if (!examplesOn()) {
    if (process.argv.includes("--reset")) throw new Error("Example circles are off here (live PayPal or TEND_EXAMPLES=0), so db:reset won't wipe anything.");
    console.log("Example circles are off (live PayPal or TEND_EXAMPLES=0). Nothing to seed; set Tend up for someone at /start.");
    return;
  }
  const db = await getDb();
  if (process.argv.includes("--reset")) {
    await db.execute(sql`TRUNCATE push_subscriptions, dashboards, recoveries, alerts, audit_events, ledger_entries, contributions, approvals,
      payment_intents, intakes, mandates, payees, members, circles CASCADE`);
    console.log("Wiped.");
  } else if ((await db.select().from(schema.circles).limit(1)).length) {
    console.log("Already seeded. Use `npm run db:reset` to start over.");
    return;
  }
  if (process.argv.includes("--bare")) {
    const { circle } = await seedDemo({ history: false });
    console.log(`Seeded "${circle.name}" without history.`);
    return;
  }
  await seedAll();
  const dupes = await scanForDuplicates();
  console.log(`Seeded two circles: the Okafor family (Mum in Houston, children in London, Toronto and Lagos) and Walter's circle (Walter in Tucson, his niece and his neighbour). ${dupes.length} double payment flagged.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
