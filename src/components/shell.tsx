"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, House, MessageCircle, ScrollText, Store, FlaskConical, Settings } from "lucide-react";
import { personVar } from "@/lib/people";
import { LiveAlert } from "./live-alert";

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
  const width = wide ? "max-w-6xl" : "max-w-5xl";
  return (
    <div className="min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-16">
      <LiveAlert />
      <header className="on-night bg-night text-night-ink">
        <div className={`mx-auto ${width} px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 sm:px-6`}>
          <div className="flex items-center gap-3">
            <Link href="/home" className="font-display text-[1.75rem] font-semibold tracking-[-0.01em]">
              Tend
            </Link>
            {(demo.paypal || demo.ai) && <DemoBadge demo={demo} />}
            <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
              <TabLinks variant="top" />
            </nav>
            <div className="ml-auto">
              <Account me={me} />
            </div>
          </div>
          {band}
        </div>
      </header>
      <main className={`mx-auto ${width} px-4 pt-5 sm:px-6`}>{children}</main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-dial/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
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
          className={`rounded-lg px-3 py-2 text-[0.9375rem] font-bold transition-colors duration-200 ${on ? "bg-night-ink/12 text-night-ink" : "text-night-soft hover:text-night-ink"}`}
        >
          {label}
        </Link>
      );
    }
    return (
      <Link
        key={href}
        href={href}
        aria-current={on ? "page" : undefined}
        className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-bold ${on ? "text-action" : "text-ink-soft"}`}
      >
        <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors duration-200 ${on ? "bg-action text-action-ink" : ""}`}>
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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-day px-2.5 py-1 text-xs font-bold whitespace-nowrap text-night"
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
      className={`inline-flex min-h-10 items-center gap-2 rounded-full py-1.5 pr-3 pl-2.5 text-sm font-bold transition-colors duration-200 ${on ? "bg-night-ink/20" : "bg-night-ink/10 hover:bg-night-ink/16"}`}
    >
      <span aria-hidden className="size-2.5 rounded-full ring-2 ring-night-ink/30" style={{ background: personVar(me) }} />
      <span className="whitespace-nowrap">
        {me.name}
        <span className="hidden font-normal text-night-soft sm:inline"> in {me.city}</span>
      </span>
      <Settings aria-hidden size={16} className="text-night-soft" />
      <span className="sr-only">, settings</span>
    </Link>
  );
}
