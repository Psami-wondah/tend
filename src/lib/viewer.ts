import { cookies } from "next/headers";

/**
 * Demo identity. The hackathon build has no sign-in: the welcome screen sets
 * who you're viewing as, and every page reads it from this cookie.
 */
export const VIEWER_COOKIE = "tend_as";

export async function viewerId(): Promise<string | null> {
  return (await cookies()).get(VIEWER_COOKIE)?.value ?? null;
}
