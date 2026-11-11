import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Jost } from "next/font/google";
import "./globals.css";
import { viewerId } from "@/lib/viewer";
import { inviteToken } from "@/lib/session";

// Jost carries amounts, times and headings like lobby-clock numerals;
// Atkinson Hyperlegible Next carries every line people read, on the person's screen most of all.
const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap" });
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  // Signed in, the Home Screen app starts at this person's own link (see manifest.webmanifest).
  const me = await viewerId();
  return {
    title: { default: "Tend", template: "%s · Tend" },
    description: "Their money, their say: a second key for the people an older adult trusts. Built on PayPal, with AI.",
    appleWebApp: { capable: true, title: "Tend", statusBarStyle: "black-translucent" },
    manifest: me ? `/manifest.webmanifest?k=${encodeURIComponent(await inviteToken(me))}` : "/manifest.webmanifest",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#103f55" },
    { media: "(prefers-color-scheme: dark)", color: "#103f55" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jost.variable} ${atkinson.variable}`}>
      <body className="min-h-dvh">
        {/* On a Home Screen app the page runs under the status bar; this keeps the time readable over scrolled content. */}
        <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[env(safe-area-inset-top)] bg-night" />
        {children}
      </body>
    </html>
  );
}
