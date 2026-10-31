import type { Reason } from "@/lib/mandate/types";

const MARK: Record<Reason["effect"], { glyph: string; cls: string; sr: string }> = {
  refuse: { glyph: "✕", cls: "text-brick", sr: "Refuses:" },
  hold: { glyph: "◷", cls: "text-marigold", sr: "Holds:" },
  needs_approval: { glyph: "?", cls: "text-marigold", sr: "Needs approval:" },
  auto_pay: { glyph: "✓", cls: "text-passbook", sr: "Allows:" },
};

/** The mandate's reasons, in plain words. This is Tend showing its working. */
export function Reasons({ reasons }: { reasons: Reason[] }) {
  return (
    <ul className="space-y-2">
      {reasons.map((r) => (
        <li key={r.code} className="flex gap-3 leading-snug">
          <span aria-hidden className={`mt-0.5 w-4 shrink-0 text-center font-extrabold ${MARK[r.effect].cls}`}>
            {MARK[r.effect].glyph}
          </span>
          <span>
            <span className="sr-only">{MARK[r.effect].sr} </span>
            {r.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
