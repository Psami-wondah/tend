import type { IntentStatus } from "@/lib/db/schema";

const LABEL: Record<IntentStatus, string> = {
  awaiting_approval: "Waiting for approval",
  on_hold: "Waiting for a top-up",
  refused: "Refused by Tend",
  rejected: "Declined by family",
  approved: "Approved",
  paying: "Paying",
  paid: "Paid",
  failed: "Failed",
};

const TONE: Record<IntentStatus, string> = {
  awaiting_approval: "bg-marigold-tint text-marigold",
  on_hold: "bg-marigold-tint text-marigold",
  refused: "bg-brick-tint text-brick",
  rejected: "bg-paper text-ink-soft",
  approved: "bg-passbook-tint text-passbook",
  paying: "bg-passbook-tint text-passbook",
  paid: "bg-passbook-tint text-passbook",
  failed: "bg-brick-tint text-brick",
};

export function StatusPill({ status }: { status: IntentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${TONE[status]}`}>
      {LABEL[status]}
    </span>
  );
}
