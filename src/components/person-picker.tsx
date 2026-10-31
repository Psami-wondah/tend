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
    <ul className={`grid grid-cols-2 gap-3 ${people.length >= 4 ? "sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}`}>
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
              className="group flex w-full flex-col items-center rounded-2xl bg-night-ink/6 px-3 pt-5 pb-4 text-center transition-colors duration-200 hover:bg-night-ink/12 disabled:opacity-70"
            >
              <Dial person={p} now={now} size={92} />
              <span className="mt-3 font-display text-xl font-semibold">{busy === p.id ? "Opening…" : p.name}</span>
              <span className="text-sm text-night-soft">{p.city}</span>
              <span className="figures inline-flex items-center gap-1 text-sm text-night-soft">
                {t.label}
                {night && <Moon aria-label="night" size={13} />}
              </span>
              <span className="mt-2.5 rounded-full bg-night-ink/10 px-3 py-1 text-[0.8125rem] font-bold group-hover:bg-day group-hover:text-night">
                {mum ? "Pay or check something" : p.relation ? `${p.relation.charAt(0).toUpperCase()}${p.relation.slice(1)}, second key` : "Second key"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
