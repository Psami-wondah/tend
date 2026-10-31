import Link from "next/link";
import type { LedgerEntry } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * The pot, drawn as a passbook page: date, what, in, out, running balance.
 * Every row links back to the decision that caused it.
 */
export function Passbook({
  rows,
  currency,
  asMemberId,
}: {
  rows: (LedgerEntry & { balanceMinor: number })[];
  currency: string;
  asMemberId: string;
}) {
  if (!rows.length) {
    return <p className="rounded-2xl bg-sheet p-6 text-ink-soft">Nothing in the passbook yet. Top up the pot to start.</p>;
  }
  const m = (v: number) => formatMoney(Math.abs(v), currency);
  return (
    <div className="overflow-hidden rounded-2xl border border-rule bg-sheet">
      <table className="figures w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Care pot passbook, newest first</caption>
        <thead>
          <tr className="border-b-2 border-passbook text-sm text-ink-soft">
            <th scope="col" className="w-20 px-4 py-3 font-bold sm:w-24">Date</th>
            <th scope="col" className="px-2 py-3 font-bold">Details</th>
            <th scope="col" className="w-24 px-2 py-3 text-right font-bold">In</th>
            <th scope="col" className="w-24 px-2 py-3 text-right font-bold">Out</th>
            <th scope="col" className="hidden w-28 px-4 py-3 text-right font-bold sm:table-cell">Balance</th>
          </tr>
        </thead>
        <tbody className="passbook-page">
          {rows.map((r) => (
            <tr key={r.id} className="h-12 align-middle">
              <td className="whitespace-nowrap px-4 text-sm text-ink-soft">{dateFmt.format(r.createdAt)}</td>
              <td className="truncate px-2" title={r.description}>
                {r.intentId ? (
                  <Link href={`/payments/${r.intentId}?as=${asMemberId}`} className="hover:underline">
                    {r.description}
                  </Link>
                ) : (
                  r.description
                )}
              </td>
              <td className="px-2 text-right font-bold text-passbook">{r.amountMinor > 0 ? m(r.amountMinor) : ""}</td>
              <td className="px-2 text-right font-bold">{r.amountMinor < 0 ? m(r.amountMinor) : ""}</td>
              <td className="hidden px-4 text-right text-ink-soft sm:table-cell">{formatMoney(r.balanceMinor, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
