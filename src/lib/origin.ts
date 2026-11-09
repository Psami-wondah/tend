/**
 * Tend's public address, for invite links, redirects, PayPal return URLs and
 * the push sender. APP_URL wins; on Render, RENDER_EXTERNAL_URL is set for
 * us. Without either, the forwarded host and scheme, because behind a proxy
 * the request's own URL says localhost.
 */

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/;

/** The configured address, if any, with no trailing slash. */
export function configuredOrigin(): string {
  const app = process.env.APP_URL?.trim();
  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  // A localhost APP_URL copied over from a laptop's .env must not win on Render.
  const url = app?.startsWith("http") && !(render && LOCAL.test(app)) ? app : render;
  return (url ?? "").replace(/\/$/, "");
}

function fromHeaders(h: Headers): string {
  const host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host");
  if (!host) return "";
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (LOCAL.test(`http://${host}`) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Public origin for a route handler. */
export function originOf(req: Request): string {
  return configuredOrigin() || fromHeaders(req.headers) || new URL(req.url).origin;
}

/** Public origin for a page or server function. */
export async function pageOrigin(): Promise<string> {
  const configured = configuredOrigin();
  if (configured) return configured;
  const { headers } = await import("next/headers");
  return fromHeaders(await headers()) || "http://localhost:3000";
}
