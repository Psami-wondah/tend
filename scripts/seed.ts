/**
 * Seeds the demo care circle.
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
import { seedDemo } from "../src/lib/db/seed-demo";

async function main() {
  const db = await getDb();
  if (process.argv.includes("--reset")) {
    await db.execute(sql`TRUNCATE alerts, audit_events, ledger_entries, contributions, approvals,
      payment_intents, intakes, mandates, payees, members, circles CASCADE`);
    console.log("Wiped.");
  } else if ((await db.select().from(schema.circles).limit(1)).length) {
    console.log("Already seeded. Use `npm run db:reset` to start over.");
    return;
  }
  const { circle } = await seedDemo();
  console.log(`Seeded "${circle.name}" (${circle.currency}): Ada, Tunde, Chioma, Mum; 3 payees.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
