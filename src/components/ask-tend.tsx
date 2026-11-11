"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, MessageCircle, ReceiptText, ScrollText, ShoppingBag, Undo2, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { AskCard } from "@/lib/agent/assistant";
import { field } from "./ui";
import { Txt } from "./figures-text";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[]; cards?: AskCard[]; offline?: boolean; error?: boolean };

function starters(who: string, pot: boolean) {
  return pot
    ? [
        "How much is in the pot, and who's put in what?",
        "Did the pharmacy charge us twice?",
        `Pay Bluebird Cabs $18 for ${who}'s taxi to the eye clinic`,
        "Ask everyone for their share of $450 for November's carer hours",
        `Find ${who} a shower chair under $60`,
        `Is anything of ${who}'s held right now?`,
      ]
    : [
        `Is anything of ${who}'s held right now?`,
        `What did we stop this month?`,
        "Who's awake right now?",
        `Find ${who} a shower chair under $60`,
        "Hold anything new for 48 hours instead of 24",
        `How much has ${who} paid the pharmacy lately?`,
      ];
}

const TOOL_LABEL: Record<string, string> = {
  care_summary: "the pot",
  recent_payments: "recent payments",
  explain_payment: "a payment's history",
  current_mandate: "the circle's rules",
  family_clocks: "everyone's clocks",
  find_duplicate_charges: "for double payments",
  propose_payment: "the rules for a payment",
  request_shares: "PayPal invoices",
  propose_rule_change: "a rule change",
  own_payments: `their own PayPal payments`,
  stop_held_payment: "a held payment",
  shop_for_mum: "a product search",
  list_transactions: "PayPal transactions",
  list_invoices: "PayPal invoices",
  get_invoice: "a PayPal invoice",
  get_order: "a PayPal order",
  list_disputes: "PayPal disputes",
  get_dispute: "a PayPal dispute",
};

export function AskTend({ memberId, firstName, currency, aiLive, who, pot }: { memberId: string; firstName: string; currency: string; aiLive: boolean; who: string; pot: boolean }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: text.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }),
      });
      const json = await res.json();
      setMessages([
        ...next,
        res.ok
          ? { role: "assistant", content: json.text, tools: json.toolCalls, cards: json.cards, offline: json.offline }
          : { role: "assistant", content: `I couldn't answer that: ${json.error ?? "something went wrong"}. Try again in a moment.`, error: true },
      ]);
    } catch {
      setMessages([...next, { role: "assistant", content: "I couldn't reach Tend. Check the connection and try again.", error: true }]);
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex min-h-[60dvh] flex-col gap-2">
      {messages.length === 0 ? (
        <div className="py-2 sm:py-4">
          <div aria-hidden className="mb-5 grid size-14 place-items-center rounded-2xl border border-rule bg-dial text-accent"><MessageCircle size={26} strokeWidth={1.6} /></div>
          <p className="max-w-2xl text-xl leading-relaxed">
            Hi {firstName}. Ask about {who}&apos;s money, what&apos;s held, or tell me to pay or stop something. Payments still go through the circle&apos;s rules.
          </p>
          <ul className="mt-7 grid gap-3 sm:grid-cols-2">
            {starters(who, pot).map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => send(s)}
                  className="min-h-24 h-full w-full rounded-2xl border border-rule bg-dial px-5 py-4 text-left text-[1.0625rem] leading-relaxed transition-colors duration-200 hover:border-accent hover:bg-accent/5"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="space-y-5" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <p className="max-w-[90%] rounded-3xl rounded-br-md bg-action px-5 py-4 whitespace-pre-wrap text-action-ink">{m.content}</p>
              ) : (
                <div className="max-w-[92%]">
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="mt-1 grid size-8 shrink-0 place-items-center rounded-full bg-action font-display text-sm font-semibold text-action-ink">
                      T
                    </span>
                    <div className="min-w-0">
                      <p className={`rounded-3xl rounded-tl-md border border-rule px-5 py-4 whitespace-pre-wrap ${m.error ? "bg-stop-tint" : "bg-dial"}`}>
                        <Txt>{m.content}</Txt>
                      </p>
                      {m.cards?.map((c, j) => <Card key={j} card={c} currency={currency} memberId={memberId} />)}
                      {(m.tools?.length || m.offline) && (
                        <p className="mt-2 text-[0.9375rem] text-ink-soft">
                          {m.tools?.length ? `Checked ${[...new Set(m.tools)].map((t) => TOOL_LABEL[t] ?? t.replaceAll("_", " ")).join(", ")}` : ""}
                          {m.offline ? `${m.tools?.length ? ". " : ""}Answered without AI (demo mode)` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
          {busy && (
            <li className="flex items-center gap-3" role="status">
              <span aria-hidden className="grid size-8 place-items-center rounded-full bg-action">
                <span className="pulse-dot size-2 rounded-full bg-day" />
              </span>
              <span className="text-ink-soft">Tend is checking…</span>
            </li>
          )}
        </ol>
      )}
      <div ref={end} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] mt-auto flex gap-2 rounded-2xl border border-rule bg-dial p-2 shadow-[0_8px_32px_-16px_rgb(18_21_28/0.2)] lg:bottom-4"
      >
        <label className="sr-only" htmlFor="ask">
          Ask Tend
        </label>
        <input
          id="ask"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={aiLive ? `Ask anything about ${who}'s money` : "Try: is anything held right now?"}
          className={field}
          autoComplete="off"
        />
        <button disabled={busy || !input.trim()} className="grid min-h-13 min-w-13 place-items-center rounded-xl bg-action text-action-ink disabled:opacity-50" aria-label="Send">
          <ArrowUp size={22} strokeWidth={2.5} />
        </button>
      </form>
    </div>
  );
}

function Card({ card, currency, memberId }: { card: AskCard; currency: string; memberId: string }) {
  const base = "mt-2 flex items-center gap-3 rounded-2xl border-2 border-rule bg-dial px-4 py-3";
  switch (card.type) {
    case "payment":
      return (
        <Link href={`/payments/${card.paymentId}`} className={`${base} hover:border-ink`}>
          <Wallet aria-hidden size={20} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">
              <span className="figures">{formatMoney(card.amountMinor, currency)}</span> to {card.payee}
            </span>
            <span className="block text-sm text-ink-soft">{OUTCOME[card.outcome] ?? card.outcome}. Open it</span>
          </span>
        </Link>
      );
    case "shares":
      return (
        <div className={base}>
          <ReceiptText aria-hidden size={20} className="shrink-0 text-accent" />
          <span>
            <span className="block font-bold">
              {card.count} PayPal invoices of <span className="figures">{formatMoney(card.shareMinor, currency)}</span>
            </span>
            <span className="block text-sm text-ink-soft">{card.simulated ? "Simulated in demo mode" : "Sent through the PayPal Agent Toolkit"}</span>
          </span>
        </div>
      );
    case "duplicates":
      return (
        <Link href="/home#recover" className={`${base} hover:border-ink`}>
          <Undo2 aria-hidden size={20} className="shrink-0 text-accent" />
          <span className="font-bold">{card.open ? `${card.open} double payment${card.open > 1 ? "s" : ""} to get back. Open home` : "Nothing paid twice"}</span>
        </Link>
      );
    case "products":
      return <Products card={card} currency={currency} memberId={memberId} />;
    case "rules":
      return (
        <Link href={`/rules?ask=${encodeURIComponent(card.ask)}`} className={`${base} hover:border-ink`}>
          <ScrollText aria-hidden size={20} className="shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="block font-bold">Review this rule change</span>
            <span className="block text-sm text-ink-soft">{card.summary}. Nothing changes until someone saves it.</span>
          </span>
        </Link>
      );
  }
}

const OUTCOME: Record<string, string> = {
  paid: "Paid",
  paying: "Paying now",
  awaiting_approval: "Waiting for the circle",
  on_hold: "Waiting for a top-up",
  refused: "Refused by the rules",
  failed: "Payment failed",
};

function Products({ card, currency, memberId }: { card: Extract<AskCard, { type: "products" }>; currency: string; memberId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; text: string; paymentId: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(productId: string) {
    setBusy(productId);
    setError(null);
    try {
      const res = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, query: card.query, maxPrice: card.maxPrice, productId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't start the purchase.");
      setDone({ id: productId, text: json.message, paymentId: json.paymentId });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      {card.products.map((p) => {
        const picked = card.pick?.productId === p.id;
        return (
          <article key={p.id} className={`rounded-2xl border-2 bg-dial p-3 ${picked ? "border-accent" : "border-rule"}`}>
            <div className="flex gap-3">
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className="size-16 shrink-0 rounded-xl bg-white object-contain" />
              ) : (
                <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-xl bg-enamel text-ink-soft">
                  <ShoppingBag size={24} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h4 className="leading-snug font-bold">{p.title}</h4>
                <p className="text-sm text-ink-soft">
                  <span className="figures text-ink">{formatMoney(p.best.priceMinor, currency)}</span> at {p.best.domain}
                  {p.best.url && (
                    <>
                      {", "}
                      <a href={p.best.url} target="_blank" rel="noreferrer" className="underline">
                        see the listing
                      </a>
                    </>
                  )}
                </p>
                {picked && (
                  <p className="mt-1 flex items-start gap-1.5 text-sm font-bold text-accent">
                    <MessageCircle aria-hidden size={14} className="mt-0.5 shrink-0" /> Tend&apos;s pick: <span className="font-normal text-ink">{card.pick?.why}</span>
                  </p>
                )}
              </div>
            </div>
            {done?.id === p.id ? (
              <p className="mt-2 text-sm">
                {done.text}{" "}
                {done.paymentId && (
                  <Link href={`/payments/${done.paymentId}`} className="font-bold underline">
                    Open it
                  </Link>
                )}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => buy(p.id)}
                disabled={busy !== null || done !== null}
                className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-rule-strong px-4 text-sm font-bold hover:border-ink disabled:opacity-50"
              >
                {busy === p.id ? "Asking the circle…" : `Buy for ${formatMoney(p.best.priceMinor, currency)}`}
              </button>
            )}
          </article>
        );
      })}
      {error && <p role="alert" className="text-sm font-bold text-stop">{error}</p>}
      <p className="text-[0.8125rem] text-ink-soft">
        {card.source === "channel3" ? "Found with Channel3 product search." : "Sample catalogue (demo mode). Add a Channel3 key to search real shops."} Buying sends it through the circle&apos;s rules first.
      </p>
    </div>
  );
}
