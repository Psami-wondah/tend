import type { Metadata } from "next";
import { passbookRows } from "@/lib/views";
import { familyContext, personProps } from "@/lib/page-context";
import { potBalanceMinor } from "@/lib/circle";
import { Shell } from "@/components/shell";
import { PassbookGrid } from "@/components/passbook-grid";
import { Money } from "@/components/ui";
import { PassbookTabs } from "@/components/passbook-tabs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Passbook" };

export default async function PassbookPage() {
  const ctx = await familyContext();
  const { rows } = await passbookRows();
  const balance = await potBalanceMinor(ctx.circle.id);
  const inTotal = rows.reduce((a, r) => a + r.inMinor, 0);
  const outTotal = rows.filter((r) => r.type !== "own").reduce((a, r) => a + r.outMinor, 0);
  const ownPaid = rows.filter((r) => r.type === "own" && r.status === "paid").reduce((a, r) => a + r.outMinor, 0);
  const kept = rows.filter((r) => r.type === "own" && (r.status === "stopped" || r.status === "refused")).reduce((a, r) => a + r.outMinor, 0);
  const pot = ctx.circle.potEnabled;

  return (
    <Shell
      me={personProps(ctx.me)}
      demo={ctx.demo}
      wide
      band={
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.01em]">Passbook</h1>
            <p className="mt-2 text-night-soft">
              {pot
                ? `Every cent in and out of ${ctx.circle.careRecipientName}'s pot, plus what ${ctx.circle.careRecipientName} paid from their own PayPal.`
                : `Everything ${ctx.circle.careRecipientName} paid from their own PayPal, and everything that was held, stopped or refused.`}
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-4 rounded-2xl border border-night-ink/15 bg-night-ink/5 px-5 py-4">
            {pot ? (
              <>
                <div>
                  <dt className="text-sm text-night-soft">Put in</dt>
                  <dd><Money minor={inTotal} currency={ctx.circle.currency} size="md" /></dd>
                </div>
                <div>
                  <dt className="text-sm text-night-soft">Paid out</dt>
                  <dd><Money minor={outTotal} currency={ctx.circle.currency} size="md" /></dd>
                </div>
                <div>
                  <dt className="text-sm text-night-soft">In the pot</dt>
                  <dd><Money minor={balance} currency={ctx.circle.currency} size="md" /></dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt className="text-sm text-night-soft">Paid</dt>
                  <dd><Money minor={ownPaid} currency={ctx.circle.currency} size="md" /></dd>
                </div>
                <div>
                  <dt className="text-sm text-night-soft">Kept in their account</dt>
                  <dd><Money minor={kept} currency={ctx.circle.currency} size="md" /></dd>
                </div>
              </>
            )}
          </dl>
          <div className="basis-full">
            <PassbookTabs current="ledger" />
          </div>
        </div>
      }
    >
      <PassbookGrid
        rows={rows}
        currency={ctx.circle.currency}
        people={ctx.members.map((m) => ({ name: m.name, color: m.color, role: m.role }))}
        aiLive={ctx.integrations.ai}
        pot={pot}
      />
    </Shell>
  );
}
