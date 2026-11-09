import { cookies } from "next/headers";
import { readSession, SESSION_COOKIE } from "./session";

/** The signed-in person on this device, from the session their invite link set. */
export const VIEWER_COOKIE = SESSION_COOKIE;

export async function viewerId(): Promise<string | null> {
  try {
    return await readSession((await cookies()).get(VIEWER_COOKIE)?.value);
  } catch {
    return null; // not in a request
  }
}
