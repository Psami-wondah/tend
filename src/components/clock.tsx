"use client";

import { useEffect, useState } from "react";
import { Moon } from "lucide-react";
import { handAngles, isDaytimeHour, localTime } from "@/lib/time";
import { personVar } from "@/lib/people";

type Person = { id: string; name: string; city: string | null; timezone: string | null; color: string | null; role: string };

/** Ticks once a minute (and on focus), starting from the server's clock so hydration matches. */
export function useNow(initial: number, everyMs = 30_000): Date {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, everyMs);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", tick);
    };
  }, [everyMs]);
  return new Date(now);
}

export function Dial({ person, now, size = 64 }: { person: Person; now: Date; size?: number }) {
  const t = localTime(person.timezone, now);
  const night = !isDaytimeHour(t.hour);
  const a = handAngles(t);
  const bezel = Math.max(3, Math.round(size / 16));
  return (
    <span
      role="img"
      aria-label={`${person.name}${person.city ? ` in ${person.city}` : ""}: ${t.label}${night ? ", probably asleep" : ""}`}
      className={`relative block shrink-0 rounded-full ${night ? "bg-face-night" : "bg-face-day"}`}
      style={{
        width: size,
        height: size,
        border: `${bezel}px solid ${personVar(person)}`,
        boxShadow: "0 1px 2px rgb(18 21 28 / 0.08), 0 6px 14px -6px rgb(18 21 28 / 0.25)",
      }}
    >
      {[0, 90, 180, 270].map((deg) => (
        <i
          key={deg}
          aria-hidden
          className={`absolute top-[6%] left-1/2 block h-[11%] w-[2px] rounded-full ${night ? "bg-hand-night/45" : "bg-hand-day/45"}`}
          style={{ transformOrigin: `50% ${size / 2 - bezel - size * 0.06}px`, transform: `translateX(-50%) rotate(${deg}deg)` }}
        />
      ))}
      <i
        aria-hidden
        className={`dial-hand absolute bottom-1/2 left-1/2 block rounded-full ${night ? "bg-hand-night" : "bg-hand-day"}`}
        style={{ width: Math.max(3, size / 18), height: size * 0.24, marginLeft: -Math.max(3, size / 18) / 2, ["--to" as string]: `${a.hour}deg` }}
      />
      <i
        aria-hidden
        className={`dial-hand absolute bottom-1/2 left-1/2 block rounded-full ${night ? "bg-hand-night" : "bg-hand-day"}`}
        style={{ width: Math.max(2, size / 26), height: size * 0.34, marginLeft: -Math.max(2, size / 26) / 2, ["--to" as string]: `${a.minute}deg` }}
      />
      <i aria-hidden className="absolute top-1/2 left-1/2 block rounded-full bg-second-hand" style={{ width: size / 9, height: size / 9, margin: -size / 18 }} />
    </span>
  );
}

/** The family clock wall: one dial per person, asleep ones gone to night. */
export function ClockRow({ people, initialNow, viewerId }: { people: Person[]; initialNow: number; viewerId?: string }) {
  const now = useNow(initialNow);
  return (
    <ul className="flex flex-wrap justify-evenly gap-x-2 gap-y-5" aria-label="Where everyone is in their day">
      {people.map((p) => {
        const t = localTime(p.timezone, now);
        const night = !isDaytimeHour(t.hour);
        return (
          <li key={p.id} className="flex min-w-16 flex-1 flex-col items-center text-center">
            <Dial person={p} now={now} size={56} />
            <span className="mt-3 text-base leading-tight font-bold">
              {p.id === viewerId ? "You" : p.name}
            </span>
            <span className="mt-1 text-[0.9375rem] leading-tight text-ink-soft">{p.city}</span>
            <span className={`figures mt-1 inline-flex items-center gap-1 text-[0.9375rem] ${night ? "text-ink-soft" : "font-medium"}`}>
              {t.label}
              {night && <Moon aria-hidden size={12} strokeWidth={2.5} />}
              {night && <span className="sr-only">, probably asleep</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Twenty-four cells, one per hour of anyone's day. Each person's dot sits at
 * their own local hour, so day and night across the family read at a glance.
 */
export function DayBand({ people, initialNow }: { people: Person[]; initialNow: number }) {
  const now = useNow(initialNow);
  const at = people.map((p) => ({ p, hour: localTime(p.timezone, now).hour }));
  return (
    <div aria-hidden className="relative">
      <div className="grid h-3 grid-cols-24 gap-[3px]">
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className={`rounded-[2px] ${isDaytimeHour(h) ? "bg-day" : "bg-night-cell"}`} />
        ))}
      </div>
      <div className="relative mt-1.5 h-3">
        {at.map(({ p, hour }, i) => {
          const sameHour = at.slice(0, i).filter((x) => x.hour === hour).length;
          return (
            <span
              key={p.id}
              className="absolute top-0 block size-3 rounded-full ring-2 ring-night"
              style={{ left: `calc(${((hour + 0.5) / 24) * 100}% - 6px + ${sameHour * 7}px)`, background: personVar(p) }}
              title={`${p.name}: ${localTime(p.timezone, now).label}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-night-soft">
        <span>midnight</span>
        <span>noon</span>
        <span>midnight</span>
      </div>
    </div>
  );
}
