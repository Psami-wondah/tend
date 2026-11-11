import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut, Smartphone } from "lucide-react";
import { familyContext, personProps } from "@/lib/page-context";
import { inviteLink } from "@/lib/session";
import { isFamily } from "@/lib/people";
import { Shell } from "@/components/shell";
import { PersonDot, btn } from "@/components/ui";
import { AlertsToggle } from "@/components/alerts-toggle";
import { InviteLink } from "@/components/invite-link";
import { ResetDemo } from "@/components/reset-demo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

const ROLE: Record<string, string> = { owner: "Set Tend up", sibling: "Second key", care_recipient: "At the centre" };

export default async function SettingsPage() {
  const ctx = await familyContext();
  const who = ctx.circle.careRecipientName;
  // The person at the centre first, then everyone else in the order they joined.
  const people = [...(ctx.mum ? [ctx.mum] : []), ...ctx.family];
  const links = await Promise.all(people.map(async (m) => ({ m, url: await inviteLink(m.id) })));

  return (
    <Shell
      me={personProps(ctx.me)}
      demo={ctx.demo}
      band={
        <div className="mt-6">
          <h1 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.01em]">Settings</h1>
          <p className="mt-2 text-night-soft">{ctx.circle.name}</p>
        </div>
      }
    >
      <div className="mx-auto max-w-2xl space-y-8">
        <section aria-labelledby="you" className="tend-panel p-5 sm:p-6">
          <h2 id="you" className="sr-only">
            You
          </h2>
          <div className="flex items-center gap-3">
            <PersonDot member={ctx.me} size={14} />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{ctx.me.name}</p>
              <p className="text-[0.9375rem] text-ink-soft">
                {ctx.me.relation ? `${who}'s ${ctx.me.relation}, ` : ""}
                {ctx.me.city}
              </p>
            </div>
            <form action="/api/signout" method="post">
              <button type="submit" className={btn.quiet}>
                <LogOut aria-hidden size={16} />
                Sign out
              </button>
            </form>
          </div>
        </section>

        {isFamily(ctx.me) && <AlertsToggle memberId={ctx.me.id} person={who} />}

        <section aria-labelledby="install" className="tend-panel p-5 sm:p-6">
          <h2 id="install" className="flex items-center gap-2 font-bold">
            <Smartphone aria-hidden size={20} className="text-ink-soft" />
            Put Tend on your Home Screen
          </h2>
          <p className="mt-1 text-[0.9375rem] text-ink-soft">It opens like an app, already signed in, and on an iPhone it&apos;s what lets alerts through.</p>
          <dl className="mt-3 grid gap-2 text-[0.9375rem] sm:grid-cols-2">
            <div className="rounded-xl bg-enamel px-3 py-2.5">
              <dt className="font-bold">iPhone</dt>
              <dd className="text-ink-soft">In Safari, tap Share, then Add to Home Screen.</dd>
            </div>
            <div className="rounded-xl bg-enamel px-3 py-2.5">
              <dt className="font-bold">Android</dt>
              <dd className="text-ink-soft">In Chrome, tap the menu, then Add to Home screen.</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="circle">
          <h2 id="circle" className="font-display text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">
            Who&apos;s in the circle
          </h2>
          <p className="mt-1 text-[0.9375rem] text-ink-soft">
            Each person gets into Tend from their own link, on as many of their devices as they like. Send it by text or email, only to them.
          </p>
          <ul className="mt-5 divide-y divide-rule overflow-hidden surface-card rounded-3xl border border-rule bg-dial">
            {links.map(({ m, url }) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-5">
                <PersonDot member={m} size={12} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {m.name}
                    {m.id === ctx.me.id && <span className="font-normal text-ink-soft"> (you)</span>}
                  </span>
                  <span className="block text-sm text-ink-soft">
                    {m.relation ? `${m.relation.charAt(0).toUpperCase()}${m.relation.slice(1)}, ` : ""}
                    {ROLE[m.role]?.toLowerCase() ?? m.role} · {m.city}
                  </span>
                </span>
                <InviteLink url={url} name={m.name} self={m.id === ctx.me.id} />
              </li>
            ))}
          </ul>
        </section>

        {ctx.example && (
          <section aria-labelledby="example" className="rounded-3xl border border-dashed border-rule-strong p-5 sm:p-6">
            <h2 id="example" className="font-bold">
              This is an example circle
            </h2>
            <p className="mt-1 text-[0.9375rem] text-ink-soft">
              {ctx.circle.story} Everyone here is made up. Open it as someone else to see their side, or put everything back the way it started.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/demo" className={btn.secondary}>
                Open as someone else
              </Link>
              <ResetDemo />
            </div>
          </section>
        )}

        <nav aria-label="More" className="divide-y divide-rule overflow-hidden surface-card rounded-3xl border border-rule bg-dial">
          <Link href="/setup" className="flex min-h-14 items-center justify-between px-4 font-bold">
            What&apos;s connected
            <ChevronRight aria-hidden size={18} className="text-ink-soft" />
          </Link>
          <Link href="/setup#mcp" className="flex min-h-14 items-center justify-between px-4 font-bold">
            Use Tend from an AI assistant
            <ChevronRight aria-hidden size={18} className="text-ink-soft" />
          </Link>
        </nav>
      </div>
    </Shell>
  );
}
