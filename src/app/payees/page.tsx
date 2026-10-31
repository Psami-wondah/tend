import type { Metadata } from "next";
import { familyContext, personProps } from "@/lib/page-context";
import { payeeSummaries } from "@/lib/payees";
import { Shell } from "@/components/shell";
import { PayeesList } from "@/components/payees-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payees" };

export default async function PayeesPage() {
  const ctx = await familyContext();
  const list = await payeeSummaries(ctx.circle.id);
  const name = (id: string | null) => ctx.members.find((m) => m.id === id)?.name ?? null;
  const unverified = list.filter((l) => !l.payee.verified).length;

  return (
    <Shell
      me={personProps(ctx.me)}
      people={ctx.members.map(personProps)}
      demo={ctx.demo}
      band={
        <div className="mt-6">
          <h1 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.01em]">Who Tend can pay</h1>
          <p className="mt-2 max-w-2xl text-night-soft">
            {list.length} payees{unverified ? `, ${unverified} still to verify` : ", all verified"}. Tend only sends money to PayPal accounts the family has checked.
          </p>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl">
        <PayeesList
          memberId={ctx.me.id}
          currency={ctx.circle.currency}
          simulated={ctx.integrations.paypal === "simulated"}
          rows={list.map(({ payee: p, paidMinor, paidCount, lastPaidAt }) => ({
            id: p.id,
            name: p.name,
            kind: p.kind,
            paypalEmail: p.paypalEmail,
            aliases: p.aliases,
            verified: p.verified,
            verifiedBy: name(p.verifiedBy),
            verifiedAt: p.verifiedAt?.toISOString() ?? null,
            verificationSent: Boolean(p.verificationCode),
            addedBy: name(p.addedBy),
            paidMinor,
            paidCount,
            lastPaidAt: lastPaidAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </Shell>
  );
}
