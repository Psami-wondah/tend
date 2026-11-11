import { readInvite } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Tend on a phone's Home Screen. Added while signed in, the app starts at
 * that person's own link, so it opens on their screen and stays signed in
 * even on an iPhone, where a Home Screen app keeps its own cookies.
 */
export async function GET(req: Request) {
  const k = new URL(req.url).searchParams.get("k");
  const signedIn = Boolean(k && (await readInvite(k)));
  return Response.json(
    {
      id: "/",
      name: "Tend",
      short_name: "Tend",
      description: "Their money, their say. A second key for the people they trust.",
      start_url: signedIn ? `/join/${encodeURIComponent(k!)}` : "/",
      scope: "/",
      display: "standalone",
      background_color: "#103f55",
      theme_color: "#103f55",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        // Android crops this one to its own icon shape (made by scripts/make-icons.mjs).
        { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "private, no-store" } },
  );
}
