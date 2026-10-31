"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { btn } from "./ui";

export function ResetDemo() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  async function reset() {
    setState("busy");
    const res = await fetch("/api/demo/reset", { method: "POST" });
    if (res.ok) {
      setState("done");
      router.refresh();
    } else {
      setState("error");
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't reset.");
    }
  }
  if (state === "confirm") {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={reset} className={`${btn.danger} border-stop text-stop`}>
          Yes, wipe and reload
        </button>
        <button type="button" onClick={() => setState("idle")} className={btn.secondary}>
          Keep everything
        </button>
      </div>
    );
  }
  return (
    <div>
      <button type="button" onClick={() => setState("confirm")} disabled={state === "busy"} className={btn.secondary}>
        <RotateCcw aria-hidden size={17} />
        {state === "busy" ? "Reloading the demo…" : "Reset the demo"}
      </button>
      {state === "done" && <p role="status" className="mt-2 font-bold text-paid">Done. The Okafor family is back to the start.</p>}
      {state === "error" && <p role="alert" className="mt-2 font-bold text-stop">{error}</p>}
    </div>
  );
}
