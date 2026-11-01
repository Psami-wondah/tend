import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, Jost } from "next/font/google";
import "./globals.css";

// Jost carries amounts, times and headings like lobby-clock numerals;
// Atkinson Hyperlegible Next carries every line people read, on the person's screen most of all.
const jost = Jost({ subsets: ["latin"], variable: "--font-jost", display: "swap" });
const atkinson = Atkinson_Hyperlegible_Next({ subsets: ["latin"], variable: "--font-atkinson", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Tend", template: "%s · Tend" },
  description: "Their money, their say: a second key for the people an older adult trusts. Built on PayPal, with AI.",
  appleWebApp: { capable: true, title: "Tend", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1c2250" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f26" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jost.variable} ${atkinson.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
