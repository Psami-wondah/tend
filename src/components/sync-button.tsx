"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Pull payout and invoice status from PayPal (for when webhooks can't reach us). */
export function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        await fetch("/api/sync", { method: "POST" });
        setBusy(false);
        router.refresh();
      }}
      className="text-sm font-bold underline underline-offset-4"
    >
      {busy ? "Checking PayPal…" : "Check PayPal for updates"}
    </button>
  );
}
