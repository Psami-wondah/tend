import { getCircle, getMembers } from "./circle";
import { viewerId } from "./viewer";
import { integrations } from "./setup";
import { isFamily } from "./people";
import type { Member } from "./db/schema";

/** What every family page needs: who's looking, everyone's clock, what's connected. */
export async function familyContext() {
  const circle = await getCircle();
  const members = await getMembers(circle.id);
  const family = members.filter(isFamily);
  const asId = await viewerId();
  const me: Member = family.find((m) => m.id === asId) ?? family.find((m) => m.role === "owner") ?? family[0];
  const mum = members.find((m) => m.role === "care_recipient") ?? null;
  const i = integrations();
  return {
    circle,
    members,
    family,
    me,
    mum,
    integrations: i,
    demo: { paypal: i.paypal === "simulated", ai: !i.ai },
    /** Mum first, then the family: the order of the clock wall. */
    clockPeople: [...(mum ? [mum] : []), ...family],
    now: Date.now(),
  };
}

/** Plain-object version of a member for client components. */
export const personProps = (m: Member) => ({ id: m.id, name: m.name, city: m.city, timezone: m.timezone, color: m.color, role: m.role });
