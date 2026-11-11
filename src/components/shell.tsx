"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, House, MessageCircle, ScrollText, Store, FlaskConical, Settings } from "lucide-react";
import { personVar } from "@/lib/people";
import { Live } from "./live";

type Person = { id: string; name: string; city: string | null; color: string | null; role: string };

const TABS = [
  { href: "/home", label: "Home", Icon: House },
  { href: "/passbook", label: "Passbook", Icon: BookOpen },
  { href: "/ask", label: "Ask Tend", Icon: MessageCircle },
  { href: "/rules", label: "Rules", Icon: ScrollText },
  { href: "/payees", label: "Payees", Icon: Store },
];

/**
 * The family side's frame: a night-indigo header (the shell's committed
 * colour) holding the brand, who you are, and each page's own header content,
 * then the page on enamel, with tabs at the bottom on phones.
 */
export function Shell({
  me,
  demo,
  band,
  children,
  wide = false,
}: {
  me: Person;
  demo: { paypal: boolean; ai: boolean };
  band?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const width = wide ? "max-w-7xl" : "max-w-6xl";
  return (
    <div className="min-h-dvh pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-20">
      <Live />
      <header className="on-night border-b border-night-ink/10 bg-night text-night-ink shadow-[0_3px_18px_-12px_rgb(16_63_85/0.5)]">
        <div className={`mx-auto ${width} px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8`}>
          <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 pb-3 sm:min-h-20 sm:gap-x-4">
            <Link href="/home" className="inline-flex min-h-12 items-center gap-3 font-display text-[1.875rem] font-medium tracking-[-0.04em]">
              <span aria-hidden className="tend-mark text-day" />
              Tend
            </Link>
            {(demo.paypal || demo.ai) && <DemoBadge demo={demo} />}
            <nav aria-label="Main" className="ml-5 hidden items-center gap-1 lg:flex">
              <TabLinks variant="top" />
            </nav>
            <div className="ml-auto">
              <Account me={me} />
            </div>
          </div>
          {band && <div className="shell-band border-t border-night-ink/12">{band}</div>}
        </div>
      </header>
      <main className={`mx-auto ${width} px-4 pt-7 sm:px-8 sm:pt-9`}>{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-dial px-2 pt-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          <TabLinks variant="bottom" />
        </div>
      </nav>
    </div>
  );
}

function TabLinks({ variant }: { variant: "top" | "bottom" }) {
  const path = usePathname();
  return TABS.map(({ href, label, Icon }) => {
    const on = path === href || (href !== "/home" && path.startsWith(href));
    if (variant === "top") {
      return (
        <Link
          key={href}
          href={href}
          aria-current={on ? "page" : undefined}
          className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-3 py-2 text-[0.9375rem] font-bold transition-colors duration-200 ${on ? "border-night-ink text-night-ink" : "border-transparent text-night-soft hover:border-night-soft hover:text-night-ink"}`}
        >
          <Icon aria-hidden size={16} strokeWidth={1.8} />
          {label}
        </Link>
      );
    }
    return (
      <Link
        key={href}
        href={href}
        aria-current={on ? "page" : undefined}
        className={`flex min-h-18 flex-col items-center justify-center gap-1 text-xs font-bold ${on ? "text-accent" : "text-ink-soft"}`}
      >
        <span className={`grid h-8 w-14 place-items-center rounded-full border-b-2 transition-colors duration-200 ${on ? "border-action bg-action text-action-ink" : "border-transparent"}`}>
          <Icon aria-hidden size={19} strokeWidth={2.25} />
        </span>
        {label}
      </Link>
    );
  });
}

function DemoBadge({ demo }: { demo: { paypal: boolean; ai: boolean } }) {
  const what = demo.paypal && demo.ai ? "PayPal simulated, no AI key" : demo.paypal ? "PayPal simulated" : "No AI key";
  return (
    <Link
      href="/setup"
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 py-1 text-xs font-bold whitespace-nowrap text-night-soft underline decoration-night-soft underline-offset-4 hover:text-night-ink"
      title={`${what}. See what's connected.`}
    >
      <FlaskConical aria-hidden size={13} strokeWidth={2.5} />
      Demo<span className="hidden sm:inline"> mode</span>
    </Link>
  );
}

/** Who's signed in, which is also the way to Settings. */
function Account({ me }: { me: Person }) {
  const on = usePathname() === "/settings";
  return (
    <Link
      href="/settings"
      aria-current={on ? "page" : undefined}
      className={`inline-flex min-h-12 max-w-full items-center gap-2.5 border-l border-night-ink/30 py-2 pr-1 pl-4 text-sm font-bold transition-colors duration-200 ${on ? "underline underline-offset-4" : "hover:underline hover:underline-offset-4"}`}
    >
      <span aria-hidden className="size-2.5 rounded-full ring-2 ring-night-ink/30" style={{ background: personVar(me) }} />
      <span className="whitespace-nowrap">
        {me.name}
        <span className="hidden font-normal text-night-soft xl:inline"> in {me.city}</span>
      </span>
      <Settings aria-hidden size={16} className="text-night-soft" />
      <span className="sr-only">, settings</span>
    </Link>
  );
}
