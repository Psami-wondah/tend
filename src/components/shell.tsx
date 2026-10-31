"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpen, House, MessageCircle, ScrollText, Store, FlaskConical, ChevronDown } from "lucide-react";
import { personVar } from "@/lib/people";

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
  people,
  demo,
  band,
  children,
  wide = false,
}: {
  me: Person;
  people: Person[];
  demo: { paypal: boolean; ai: boolean };
  band?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const width = wide ? "max-w-6xl" : "max-w-5xl";
  return (
    <div className="min-h-dvh pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-16">
      <header className="on-night bg-night text-night-ink">
        <div className={`mx-auto ${width} px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 sm:px-6`}>
          <div className="flex items-center gap-3">
            <Link href="/" className="font-display text-[1.75rem] font-semibold tracking-[-0.01em]" aria-label="Tend, choose who you are">
              Tend
            </Link>
            {(demo.paypal || demo.ai) && <DemoBadge demo={demo} />}
            <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
              <TabLinks variant="top" />
            </nav>
            <div className="ml-auto">
              <ViewerSwitch me={me} people={people} />
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
      title={`${what}. Add keys on the Setup page.`}
    >
      <FlaskConical aria-hidden size={13} strokeWidth={2.5} />
      Demo<span className="hidden sm:inline"> mode</span>
    </Link>
  );
}

/** Demo stand-in for sign-in: switch which family member you're viewing as. */
export function ViewerSwitch({ me, people }: { me: Person; people: Person[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function pick(id: string) {
    if (id === "__circles") return router.push("/");
    setBusy(true);
    const res = await fetch("/api/viewer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: id }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (json.role === "care_recipient") router.push("/me");
    else router.refresh();
  }
  return (
    <label className="relative inline-flex min-h-10 items-center gap-2 rounded-full bg-night-ink/10 py-1.5 pr-8 pl-2.5 text-sm font-bold">
      <span aria-hidden className="size-2.5 rounded-full ring-2 ring-night-ink/30" style={{ background: personVar(me) }} />
      <span className="sr-only">Viewing as</span>
      <span aria-hidden className="whitespace-nowrap">
        {me.name}
        <span className="hidden font-normal text-night-soft sm:inline"> in {me.city}</span>
      </span>
      <ChevronDown aria-hidden size={16} className="absolute right-2.5" />
      <select
        value={me.id}
        disabled={busy}
        onChange={(e) => void pick(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label="Viewing as"
      >
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.role === "care_recipient" ? `${p.name} (their own screen)` : `${p.name}, ${p.city}`}
          </option>
        ))}
        <option value="__circles">Another circle…</option>
      </select>
    </label>
  );
}
