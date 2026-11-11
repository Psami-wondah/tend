import type { Metadata } from "next";
import { familyContext, personProps } from "@/lib/page-context";
import { circleReport, savedDashboard } from "@/lib/report";
import { Shell } from "@/components/shell";
import { PassbookTabs } from "@/components/passbook-tabs";
import { CircleDashboardLoader } from "@/components/circle-dashboard-loader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await familyContext();
  const report = await circleReport(ctx.circle.id);
  const saved = await savedDashboard(ctx.circle.id);
  const person = ctx.circle.careRecipientName;

  return (
    <Shell
      me={personProps(ctx.me)}
      demo={ctx.demo}
      wide
      band={
        <div className="mt-6">
          <h1 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.01em]">Dashboard</h1>
          <p className="mt-2 max-w-3xl text-night-soft">
            {`The same money as the ledger, as a picture: what ${person} paid, what Tend kept in their account, and who in the circle stepped in, day or night. Built with AG Studio; change any of it.`}
          </p>
          <PassbookTabs current="dashboard" />
        </div>
      }
    >
      <CircleDashboardLoader report={report} saved={saved} memberId={ctx.me.id} aiLive={ctx.integrations.ai} licenseKey={process.env.AG_GRID_LICENSE_KEY || undefined} />
    </Shell>
  );
}
