/**
 * The family lives in different time zones. These helpers answer "what time
 * is it for Tunde?" and "is Chioma likely awake?" so Tend can show the right
 * people a payment that's waiting.
 */

export const DEFAULT_TZ = "America/Chicago";

/** Waking hours, local time. Outside these Tend treats someone as asleep. */
export const WAKE_HOUR = 7;
export const SLEEP_HOUR = 22;

export interface LocalTime {
  hour: number; // 0–23
  minute: number;
  second: number;
  /** "9:20 am" */
  label: string;
  /** "Sat" */
  weekday: string;
}

export function localTime(timezone: string | null | undefined, at: Date = new Date()): LocalTime {
  const tz = safeZone(timezone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return {
    hour,
    minute,
    second,
    label: `${h12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`,
    weekday: get("weekday"),
  };
}

export function isAwake(timezone: string | null | undefined, at: Date = new Date()): boolean {
  const { hour } = localTime(timezone, at);
  return hour >= WAKE_HOUR && hour < SLEEP_HOUR;
}

/** Hour-of-day cells for the 24-cell day band. */
export function isDaytimeHour(hour: number): boolean {
  return hour >= WAKE_HOUR && hour < SLEEP_HOUR;
}

/** Clock-hand angles in degrees, 12 o'clock = 0. */
export function handAngles(t: Pick<LocalTime, "hour" | "minute" | "second">) {
  return {
    hour: ((t.hour % 12) + t.minute / 60) * 30,
    minute: (t.minute + t.second / 60) * 6,
    second: t.second * 6,
  };
}

/** "3:20 am in Toronto" style label for an event, in someone else's zone. */
export function stampIn(timezone: string | null | undefined, at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: safeZone(timezone),
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
}

function safeZone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Splits the family into who's awake now and who isn't. */
export function whoIsAwake<T extends { timezone: string | null }>(people: T[], at: Date = new Date()) {
  const awake: T[] = [];
  const asleep: T[] = [];
  for (const p of people) (isAwake(p.timezone, at) ? awake : asleep).push(p);
  return { awake, asleep };
}
