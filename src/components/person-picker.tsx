"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dial, useNow } from "./clock";
import { Moon } from "lucide-react";
import { isDaytimeHour, localTime } from "@/lib/time";

type Person = { id: string; name: string; city: string | null; timezone: string | null; color: string | null; role: string; relation?: string | null };

/** The clock wall as a door: pick whose screen to open. */
export function PersonPicker({ people, initialNow }: { people: Person[]; initialNow: number }) {
  const router = useRouter();
  const now = useNow(initialNow);
  const [busy, setBusy] = useState<string | null>(null);

  async function choose(p: Person) {
    setBusy(p.id);
    const res = await fetch("/api/viewer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memberId: p.id }) });
    if (!res.ok) return setBusy(null);
    router.push(p.role === "care_recipient" ? "/me" : "/home");
  }

  return (
    <ul className={`grid grid-cols-2 gap-3 sm:gap-4 ${people.length >= 4 ? "sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}`}>
      {people.map((p) => {
        const t = localTime(p.timezone, now);
        const night = !isDaytimeHour(t.hour);
        const mum = p.role === "care_recipient";
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => choose(p)}
              disabled={busy !== null}
              className="group flex h-full w-full flex-col items-center rounded-xl border border-night-soft px-3 pt-7 pb-5 text-center transition-colors duration-200 hover:border-night-ink disabled:opacity-70 sm:px-4 sm:pt-8 sm:pb-6"
            >
              <Dial person={p} now={now} size={92} />
              <span className="mt-5 font-display text-2xl font-semibold tracking-[-0.015em] group-hover:underline">{busy === p.id ? "Opening…" : p.name}</span>
              <span className="text-[0.9375rem] text-night-soft">{p.city}</span>
              <span className="figures mt-1 inline-flex items-center gap-1 text-base text-night-soft">
                {t.label}
                {night && <Moon aria-label="night" size={13} />}
              </span>
              <span className="mt-4 border-t border-night-soft pt-3 text-sm leading-snug font-bold">
                {mum ? "Pay or check something" : p.relation ? `${p.relation.charAt(0).toUpperCase()}${p.relation.slice(1)}, second key` : "Second key"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
