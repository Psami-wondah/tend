import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, CircleDashed } from "lucide-react";
import { pageOrigin } from "@/lib/origin";
import { familyContext, personProps } from "@/lib/page-context";
import { integrations } from "@/lib/setup";
import { viewerId } from "@/lib/viewer";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "What's connected" };

/** What this Tend is connected to, for whoever runs it. Open to anyone, signed in or not. */
export default async function SetupPage() {
  const ctx = (await viewerId()) ? await familyContext() : null;
  const i = ctx?.integrations ?? integrations();
  const mcpUrl = `${await pageOrigin()}/api/mcp`;
  const items = [
    {
      ok: i.ai,
      title: "AI reads bills and answers questions",
      body: i.ai
        ? "Connected. AI can read bills and answer questions."
        : "Not connected. The examples and typed messages still work with a keyword reader, but photos need AI.",
      fix: "Add OPENROUTER_API_KEY (openrouter.ai, Keys) or ANTHROPIC_API_KEY (console.anthropic.com) to .env, then restart.",
    },
    {
      ok: i.voice,
      title: "Answers read aloud in a natural voice",
      body: i.voice ? "On. Answers are read aloud in a natural voice." : "The person's screen uses the browser's own voice, which can sound robotic.",
      fix: "Comes with OPENROUTER_API_KEY. Pick another voice with TEND_VOICE_MODEL and TEND_VOICE (an available AI voice), or set TEND_VOICE=off.",
    },
    {
      ok: i.paypal !== "simulated",
      title: "PayPal moves real sandbox money",
      body:
        i.paypal === "simulated"
          ? "Simulated. Payouts, top-ups and invoices get SIM- ids and are labelled everywhere."
          : `Connected to PayPal ${i.paypal}: Payouts, Orders, Invoicing and the Agent Toolkit.`,
      fix: "developer.paypal.com: Apps & Credentials, Sandbox, create a Merchant app with Payouts and Invoicing ticked. Put the client ID and secret in PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. The PayPal buttons (JS SDK v6) get a client token from the server, so nothing else is needed.",
    },
    {
      ok: i.sandboxEmails.every((e) => e.set),
      title: "Sandbox accounts for payees and the circle",
      body: `${i.sandboxEmails.filter((e) => e.set).length} of ${i.sandboxEmails.length} set. Without them, payouts go to example addresses PayPal will reject.`,
      fix: "developer.paypal.com: Testing tools, Sandbox accounts. Copy a Personal account email into each SANDBOX_*_EMAIL (one account can be reused), then run npm run db:reset. Each person approves their own payments by logging in to their account.",
    },
    {
      ok: i.paypal !== "simulated",
      title: "Held payments use PayPal authorize, capture and void",
      body:
        i.paypal === "simulated"
          ? "Simulated: holds, releases and stops run on SIM- authorizations."
          : "Real sandbox authorizations: the person approves in PayPal (JS SDK v6), the money is held, then captured or voided.",
      fix: "Comes with the PayPal keys above. The person approves with a Personal sandbox account.",
    },
    {
      ok: i.paypal !== "simulated",
      title: "Saved PayPal for regular bills (Vault)",
      body: i.paypal === "simulated" ? "Simulated: saving a PayPal creates a SIM- payment token." : "Uses PayPal Payment Method Tokens v3.",
      fix: "developer.paypal.com: open your sandbox app, and under features make sure Vault is ticked. Without it, Tend asks the person to approve each payment instead.",
    },
    {
      ok: i.channel3,
      title: "Shopping searches real retailers",
      body: i.channel3 ? "Channel3 product search is on." : "Ask Tend shops from a small sample catalogue.",
      fix: "Get a free key at trychannel3.com (1,000 searches a month) and set CHANNEL3_API_KEY.",
    },
    {
      ok: i.agLicense,
      title: "The dashboard (AG Studio) without a watermark",
      body: i.agLicense
        ? "Licensed: AG Studio and AG Grid Enterprise run without a watermark."
        : "Every feature works, including the AI assistant, with a trial watermark and a console notice.",
      fix: "Email info@ag-grid.com for a trial licence key and set AG_GRID_LICENSE_KEY.",
    },
    {
      ok: i.webhook,
      title: "PayPal webhooks",
      body: i.webhook ? "Signature verification on." : "Off. Tend polls PayPal instead while payments are in flight, which is fine locally.",
      fix: "After deploying, add a webhook to your app for PAYMENT.PAYOUTS-ITEM.*, INVOICING.INVOICE.PAID, PAYMENT.AUTHORIZATION.VOIDED and PAYMENT.CAPTURE.COMPLETED pointing at /api/webhooks/paypal, and set PAYPAL_WEBHOOK_ID.",
    },
    {
      ok: i.database === "postgres",
      title: "Database",
      body: i.database === "postgres" ? "Postgres via DATABASE_URL." : "Embedded Postgres (PGlite) in ./.data. Nothing to install.",
      fix: "Optional locally. On Render the Blueprint sets DATABASE_URL for you.",
    },
  ];

  const heading = (
    <div className="mt-6">
      <h1 className="font-display text-[2rem] leading-none font-semibold tracking-[-0.01em]">What&apos;s connected</h1>
      <p className="mt-2 max-w-2xl text-night-soft">
        Tend runs with no keys at all, in a clearly labelled demo mode. Each key you add switches part of it to the real thing.
      </p>
    </div>
  );
  const body = (
      <div className="mx-auto max-w-3xl space-y-8">
        <ul className="divide-y divide-rule overflow-hidden surface-card rounded-3xl border border-rule bg-dial">
          {items.map((it) => (
            <li key={it.title} className="flex gap-3.5 px-5 py-6 sm:px-6">
              {it.ok ? (
                <CircleCheck aria-hidden size={24} className="mt-0.5 shrink-0 text-paid" />
              ) : (
                <CircleDashed aria-hidden size={24} className="mt-0.5 shrink-0 text-wait" />
              )}
              <div className="min-w-0">
                <h2 className="font-bold">
                  {it.title}
                  <span className="sr-only">{it.ok ? ": done" : ": not set up"}</span>
                </h2>
                <p className="text-[0.9375rem] text-ink-soft">{it.body}</p>
                {!it.ok && <p className="mt-1.5 rounded-lg bg-enamel px-3 py-2 text-[0.9375rem]">{it.fix}</p>}
              </div>
            </li>
          ))}
        </ul>

        <section aria-labelledby="mcp" className="tend-panel p-5 sm:p-6">
          <h2 id="mcp" className="font-bold">Use Tend from an AI assistant (MCP)</h2>
          <p className="mt-1 text-[0.9375rem] text-ink-soft">
            Tend is also an MCP server, so any AI assistant or agent about to pay a bill can ask the circle&apos;s second key first. Eight tools: check a payment
            request, list held payments, explain a decision, search the passbook, read the rules, and stop a held payment. None of them can send money.
          </p>
          <p className="mt-3 text-sm font-bold">Claude Code</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-enamel px-3 py-2 text-sm">
            <code>claude mcp add --transport http tend {mcpUrl}</code>
          </pre>
          <p className="mt-3 text-sm font-bold">Claude.ai or Claude Desktop</p>
          <p className="text-[0.9375rem] text-ink-soft">Settings, Connectors, Add custom connector, and paste {mcpUrl}</p>
          <p className="mt-3 text-sm font-bold">Any other MCP client</p>
          <p className="text-[0.9375rem] text-ink-soft">Add a Streamable HTTP server at {mcpUrl}</p>
          <p className="mt-3 text-[0.9375rem] text-ink-soft">
            {i.mcpToken
              ? "Protected: send TEND_MCP_TOKEN as a bearer token."
              : i.paypal === "live"
                ? "Closed until you set TEND_MCP_TOKEN, because this is live PayPal."
                : "Open, because every dollar here is pretend (demo or PayPal sandbox). Set TEND_MCP_TOKEN to require a bearer token."}
          </p>
        </section>

      </div>
  );

  if (ctx) {
    return (
      <Shell me={personProps(ctx.me)} demo={ctx.demo} band={heading}>
        {body}
      </Shell>
    );
  }
  return (
    <div className="min-h-dvh pb-16">
      <header className="on-night bg-night text-night-ink">
        <div className="mx-auto max-w-5xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 sm:px-6">
          <Link href="/" className="font-display text-[1.75rem] font-semibold tracking-[-0.01em]">
            Tend
          </Link>
          {heading}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-5 sm:px-6">{body}</main>
    </div>
  );
}
