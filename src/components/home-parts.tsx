import Link from "next/link";
import { Ban, CircleCheck, Hourglass, OctagonX } from "lucide-react";
import type { LedgerEntry, Member, PaymentIntent } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { personVar } from "@/lib/people";
import { Money } from "./ui";
import { Txt } from "./figures-text";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** Who's put in what: fairness the family can see. One bar per sibling, in their colour. */
export function Fairness({ rows, currency }: { rows: { member: Member; totalMinor: number; thisMonthMinor: number }[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.totalMinor));
  const total = rows.reduce((a, r) => a + r.totalMinor, 0);
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.member.id}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-bold">
              {r.member.name}
              <span className="font-normal text-ink-soft"> in {r.member.city}</span>
            </span>
            <Money minor={r.totalMinor} currency={currency} size="sm" />
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-enamel" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${(r.totalMinor / max) * 100}%`, background: personVar(r.member) }} />
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            <Txt>
              {`${total ? `${Math.round((r.totalMinor / total) * 100)}% of everything put in` : "Nothing yet"}${
                r.thisMonthMinor > 0 ? `, ${formatMoney(r.thisMonthMinor, currency)} this month` : ", nothing this month"
              }`}
            </Txt>
          </p>
        </li>
      ))}
    </ul>
  );
}

export function RecentRows({ rows, currency }: { rows: (LedgerEntry & { balanceMinor: number })[]; currency: string }) {
  if (!rows.length) return <p className="rounded-2xl bg-dial p-5 text-ink-soft">Nothing in the passbook yet. Top up the pot to start it.</p>;
  return (
    <ul className="divide-y divide-rule overflow-hidden rounded-2xl bg-dial">
      {rows.map((r) => {
        const inner = (
          <>
            <span className="figures w-14 shrink-0 text-sm text-ink-soft">{dateFmt.format(r.createdAt)}</span>
            <span className="min-w-0 flex-1 truncate">{r.description}</span>
            <Money minor={r.amountMinor} currency={currency} size="sm" signed className={r.amountMinor > 0 ? "text-paid" : ""} />
          </>
        );
        return (
          <li key={r.id}>
            {r.intentId ? (
              <Link href={`/payments/${r.intentId}`} className="flex min-h-13 items-center gap-3 px-4 py-2.5 hover:bg-enamel/60">
                {inner}
              </Link>
            ) : (
              <div className="flex min-h-13 items-center gap-3 px-4 py-2.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Stopped({ intents, members }: { intents: PaymentIntent[]; members: { id: string; name: string }[] }) {
  const name = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Someone";
  return (
    <ul className="space-y-2">
      {intents.map((r) => {
        const voided = r.status === "voided";
        return (
          <li key={r.id}>
            <Link href={`/payments/${r.id}`} className={`flex gap-3 rounded-2xl p-4 hover:brightness-[0.98] ${voided ? "bg-dial" : "bg-stop-tint"}`}>
              {voided ? (
                <Ban aria-hidden className="mt-0.5 shrink-0 text-ink-soft" size={22} strokeWidth={2.25} />
              ) : (
                <OctagonX aria-hidden className="mt-0.5 shrink-0 text-stop" size={22} strokeWidth={2.25} />
              )}
              <span className="min-w-0">
                <span className="block font-bold">
                  {voided ? `${name(r.stoppedBy)} stopped ` : "Refused "}
                  <span className="figures">{formatMoney(r.amountMinor, r.currency)}</span> to {r.payeeName}
                </span>
                <span className="block text-[0.9375rem] text-ink-soft">
                  {voided ? (
                    <>PayPal voided the hold; the money never left. {dateFmt.format(r.createdAt)}.</>
                  ) : (
                    <>
                      <Txt>{r.evaluation.reasons.find((x) => x.effect === "refuse")?.message ?? r.summary}</Txt> {dateFmt.format(r.createdAt)}.
                    </>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Payments from the person's own PayPal: paid, held, stopped, refused. */
export function OwnRows({ intents }: { intents: PaymentIntent[] }) {
  const icon = (s: string) =>
    s === "paid" ? (
      <CircleCheck aria-hidden size={18} className="shrink-0 text-paid" />
    ) : s === "held" || s === "paying" ? (
      <Hourglass aria-hidden size={18} className="shrink-0 text-wait" />
    ) : s === "refused" ? (
      <OctagonX aria-hidden size={18} className="shrink-0 text-stop" />
    ) : (
      <Ban aria-hidden size={18} className="shrink-0 text-ink-soft" />
    );
  const word: Record<string, string> = { paid: "paid", held: "held", paying: "paying", refused: "refused", voided: "stopped", failed: "failed" };
  return (
    <ul className="divide-y divide-rule overflow-hidden rounded-2xl bg-dial">
      {intents.map((r) => (
        <li key={r.id}>
          <Link href={`/payments/${r.id}`} className="flex min-h-13 items-center gap-3 px-4 py-2.5 hover:bg-enamel/60">
            <span className="figures w-14 shrink-0 text-sm text-ink-soft">{dateFmt.format(r.createdAt)}</span>
            {icon(r.status)}
            <span className="min-w-0 flex-1 truncate">
              {r.payeeName}
              <span className="text-ink-soft"> {word[r.status] ?? r.status.replace("_", " ")}</span>
            </span>
            <Money minor={r.amountMinor} currency={r.currency} size="sm" className={r.status === "paid" ? "" : r.status === "voided" || r.status === "refused" ? "text-ink-soft line-through decoration-1" : "text-ink-soft"} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
