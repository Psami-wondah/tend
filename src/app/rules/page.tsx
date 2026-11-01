import type { Metadata } from "next";
import { familyContext, personProps } from "@/lib/page-context";
import { activeMandate, spentThisMonthByCategory } from "@/lib/circle";
import { mandateHistory } from "@/lib/rules";
import { Shell } from "@/components/shell";
import { RulesEditor } from "@/components/rules-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rules" };

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const { ask } = await searchParams;
  const ctx = await familyContext();
  const [mandate, history, spent] = await Promise.all([activeMandate(ctx.circle.id), mandateHistory(ctx.circle.id), spentThisMonthByCategory(ctx.circle.id)]);

  return (
    <Shell
      me={personProps(ctx.me)}
      people={ctx.members.map(personProps)}
      demo={ctx.demo}
      band={
        <div className="mt-6">
          <h1 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.01em]">The circle&apos;s rules</h1>
          <p className="mt-2 max-w-2xl text-night-soft">
            AI reads the bills. These rules decide what happens, the same way every time. Version {mandate.version}, last changed by {history[0]?.by ?? "the circle"}.
          </p>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl">
        <RulesEditor
          mandate={mandate}
          memberId={ctx.me.id}
          currency={ctx.circle.currency}
          spent={spent}
          history={history.map((h) => ({ version: h.version, by: h.by, at: h.at.toISOString(), changes: h.changes.map((c) => ({ label: c.label, display: c.display, loosens: c.loosens })) }))}
          initialAsk={ask ?? null}
          aiLive={ctx.integrations.ai}
          who={ctx.circle.careRecipientName}
          pot={ctx.circle.potEnabled}
        />
      </div>
    </Shell>
  );
}
