import Link from "next/link";
import { BookOpen, ChartColumn } from "lucide-react";

/** The passbook has two views of the same money: the ledger and the dashboard. */
export function PassbookTabs({ current }: { current: "ledger" | "dashboard" }) {
  const tabs = [
    { id: "ledger", href: "/passbook", label: "Ledger", Icon: BookOpen },
    {
      id: "dashboard",
      href: "/passbook/dashboard",
      label: "Dashboard",
      Icon: ChartColumn,
    },
  ] as const;
  return (
    <nav aria-label="Passbook views" className="mt-5 inline-flex gap-6">
      {tabs.map(({ id, href, label, Icon }) => (
        <Link
          key={id}
          href={href}
          aria-current={current === id ? "page" : undefined}
          className={`inline-flex min-h-12 items-center gap-2 border-b-2 px-1 text-sm font-bold transition-colors ${current === id ? "border-night-ink text-night-ink" : "border-transparent text-night-soft hover:border-night-soft hover:text-night-ink"}`}
        >
          <Icon aria-hidden size={16} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
