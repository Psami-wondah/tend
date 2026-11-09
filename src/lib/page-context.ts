import { redirect } from "next/navigation";
import { getCircle, getMembers } from "./circle";
import { viewerId } from "./viewer";
import { integrations } from "./setup";
import { isFamily } from "./people";
import type { Member } from "./db/schema";

/**
 * What every circle page needs: who's signed in, everyone's clock, what's
 * connected. Nobody signed in goes to the sign-in page; the person at the
 * centre goes to their own big-button screen unless the page is theirs.
 */
export async function familyContext(opts: { forPerson?: boolean } = {}) {
  const asId = await viewerId();
  if (!asId) redirect("/signin");
  const circle = await getCircle();
  const members = await getMembers(circle.id);
  const viewer = members.find((m) => m.id === asId);
  if (!viewer) redirect("/signin?link=expired");
  if (viewer.role === "care_recipient" && !opts.forPerson) redirect("/me");
  if (viewer.role !== "care_recipient" && opts.forPerson) redirect("/home");
  const family = members.filter(isFamily);
  const me: Member = isFamily(viewer) ? viewer : (family.find((m) => m.role === "owner") ?? family[0]);
  const mum = members.find((m) => m.role === "care_recipient") ?? null;
  const i = integrations();
  return {
    circle,
    members,
    family,
    me,
    viewer,
    mum,
    /** One of the example circles, which can be opened as anyone and reset. */
    example: Boolean(circle.story),
    integrations: i,
    demo: { paypal: i.paypal === "simulated", ai: !i.ai },
    /** Mum first, then the family: the order of the clock wall. */
    clockPeople: [...(mum ? [mum] : []), ...family],
    now: Date.now(),
  };
}

/** Plain-object version of a member for client components. */
export const personProps = (m: Member) => ({ id: m.id, name: m.name, city: m.city, timezone: m.timezone, color: m.color, role: m.role });
