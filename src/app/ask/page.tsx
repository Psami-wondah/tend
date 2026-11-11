import type { Metadata } from "next";
import { familyContext, personProps } from "@/lib/page-context";
import { Shell } from "@/components/shell";
import { AskTend } from "@/components/ask-tend";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ask Tend" };

export default async function AskPage() {
  const ctx = await familyContext();
  return (
    <Shell
      me={personProps(ctx.me)}
      demo={ctx.demo}
      band={
        <div className="mt-6">
          <h1 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.01em]">Ask Tend</h1>
          <p className="mt-2 max-w-xl text-night-soft">
            {ctx.integrations.ai
              ? `Ask in plain words. Tend looks it up in the passbook${ctx.integrations.paypal !== "simulated" ? " and PayPal" : ""}, can stop a held payment, and can suggest a payment or a rule change; the circle's rules still decide.`
              : "Demo mode: answers come from the ledger without AI. Connect AI on Setup for open questions."}
          </p>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl">
        <AskTend memberId={ctx.me.id} firstName={ctx.me.name} currency={ctx.circle.currency} aiLive={ctx.integrations.ai} who={ctx.circle.careRecipientName} pot={ctx.circle.potEnabled} />
      </div>
    </Shell>
  );
}
