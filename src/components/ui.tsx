import { Check, Clock3, Hourglass, Loader, OctagonX, Ban, TriangleAlert, CircleCheck, PauseCircle, Wallet } from "lucide-react";
import type { IntentStatus } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { personVar } from "@/lib/people";
import { Txt } from "./figures-text";

/** One numeral system for every amount (fixed steps: xl pot, lg card, md row). */
export function Money({ minor, currency, size = "md", signed = false, className = "" }: {
  minor: number;
  currency: string;
  size?: "xl" | "lg" | "md" | "sm";
  signed?: boolean;
  className?: string;
}) {
  const text = formatMoney(Math.abs(minor), currency);
  const sign = signed ? (minor > 0 ? "+" : minor < 0 ? "−" : "") : minor < 0 ? "−" : "";
  const cls = { xl: "text-[3.25rem] leading-none font-semibold tracking-[-0.02em]", lg: "text-[2.125rem] leading-none font-semibold tracking-[-0.01em]", md: "text-lg font-medium", sm: "text-base font-medium" }[size];
  return <span className={`figures ${cls} ${className}`}>{sign}{text}</span>;
}

const STATUS: Record<IntentStatus, { label: string; tone: "paid" | "wait" | "stop" | "quiet"; Icon: typeof Check }> = {
  awaiting_approval: { label: "Needs approval", tone: "wait", Icon: Hourglass },
  on_hold: { label: "Needs a top-up", tone: "wait", Icon: Clock3 },
  refused: { label: "Refused", tone: "stop", Icon: OctagonX },
  rejected: { label: "Declined", tone: "quiet", Icon: Ban },
  approved: { label: "Approved", tone: "paid", Icon: Check },
  paying: { label: "Paying now", tone: "paid", Icon: Loader },
  paid: { label: "Paid", tone: "paid", Icon: CircleCheck },
  failed: { label: "Payment failed", tone: "stop", Icon: TriangleAlert },
  awaiting_payer: { label: "Waiting for PayPal", tone: "quiet", Icon: Wallet },
  held: { label: "Held", tone: "wait", Icon: PauseCircle },
  voided: { label: "Stopped", tone: "quiet", Icon: Ban },
};

const TONE = {
  paid: "text-paid",
  wait: "text-wait",
  stop: "text-stop",
  quiet: "text-ink-soft",
};

export function StatusBadge({ status }: { status: IntentStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 py-1 text-sm font-bold whitespace-nowrap ${TONE[s.tone]}`}>
      <s.Icon aria-hidden size={15} strokeWidth={2.5} className={status === "paying" ? "animate-spin [animation-duration:2s]" : ""} />
      {s.label}
    </span>
  );
}

export const statusLabel = (s: IntentStatus) => STATUS[s].label;

type PersonLike = { name: string; color: string | null; role?: string };

export function PersonDot({ member, size = 10, dim = false }: { member: PersonLike; size?: number; dim?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: personVar(member), opacity: dim ? 0.45 : 1 }}
    />
  );
}

/** Name with their colour. `note` adds a quiet trailing word: "asleep", "approved". */
export function PersonChip({ member, note, tone = "plain" }: { member: PersonLike; note?: string; tone?: "plain" | "done" | "asleep" }) {
  const textCls = tone === "done" ? "text-paid" : "text-ink";
  const noteCls = tone === "done" ? "text-paid" : "text-ink-soft";
  return (
    <span className={`inline-flex min-h-8 items-center gap-2 ${textCls} py-1 pr-3 text-sm`}>
      <PersonDot member={member} />
      <span className="font-bold">{member.name}</span>
      {note && (
        <span className={noteCls}>
          <Txt>{note}</Txt>
        </span>
      )}
      {tone === "done" && <Check aria-hidden size={14} strokeWidth={3} className="text-paid" />}
    </span>
  );
}

export const btn = {
  primary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-action px-5 py-2.5 text-base font-bold text-action-ink transition-colors duration-200 hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-55",
  approve:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-paid px-5 py-2.5 text-base font-bold text-paid-ink transition-colors duration-200 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55",
  secondary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-rule-strong bg-dial px-5 py-2.5 text-base font-bold text-ink transition-colors duration-200 hover:border-ink disabled:cursor-not-allowed disabled:opacity-55",
  danger:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-rule-strong bg-dial px-5 py-2.5 text-base font-bold text-ink transition-colors duration-200 hover:border-stop hover:text-stop disabled:cursor-not-allowed disabled:opacity-55",
  quiet:
    "inline-flex min-h-12 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-ink-soft underline decoration-rule-strong underline-offset-4 hover:text-ink hover:decoration-ink disabled:opacity-55",
};

export const field =
  "min-h-13 w-full rounded-xl border border-rule-strong bg-dial px-4 py-2.5 text-base text-ink transition-colors placeholder:text-ink-soft/80 focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-accent";

export function SectionHeading({ id, children, action }: { id: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <h2 id={id} className="font-display text-[1.5rem] leading-tight font-medium tracking-[-0.025em]">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** A label that says a transaction is simulated or seed data, never real money. */
export function SimTag({ id }: { id: string | null | undefined }) {
  if (!id) return null;
  if (id.startsWith("SIM-")) return <span className="py-1 text-xs font-bold text-ink-soft">Simulated</span>;
  if (id.startsWith("SEED-")) return <span className="py-0.5 text-xs font-bold text-ink-soft">Seed data</span>;
  return null;
}
