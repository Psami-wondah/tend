/**
 * One colour per person, used everywhere they appear: dial bezel, dots,
 * contribution bars, approver chips. Names never need repeating next to it.
 * Keys map to CSS custom properties in globals.css (--color-person-<key>).
 */
export const PERSON_COLORS = ["brass", "cobalt", "violet", "magenta", "teal", "rust"] as const;
export type PersonColor = (typeof PERSON_COLORS)[number];

export function personColor(member: { color: string | null; role?: string } | null | undefined): PersonColor {
  const c = member?.color as PersonColor | undefined;
  if (c && PERSON_COLORS.includes(c)) return c;
  return member?.role === "care_recipient" ? "brass" : "cobalt";
}

/** CSS colour value for inline styles. */
export const personVar = (member: Parameters<typeof personColor>[0]) => `var(--color-person-${personColor(member)})`;

export function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

export function joinNames(names: string[], word: "and" | "or" = "and"): string {
  if (names.length === 0) return "the circle";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} ${word} ${names.at(-1)}`;
}

export const isFamily = (m: { role: string }) => m.role === "owner" || m.role === "sibling";
