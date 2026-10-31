"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[] };

const STARTERS = [
  "How much is in the pot and who's put in what?",
  "Did the pharmacy charge us twice this month?",
  "Pay Bluebird Cabs $18 for Mum's taxi to the eye clinic",
  "Ask everyone for their share of $450 for December's carer hours",
];

export function AskTend({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: text.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, messages: next.map(({ role, content }) => ({ role, content })) }),
    });
    const json = await res.json();
    setBusy(false);
    setMessages([...next, { role: "assistant", content: res.ok ? json.text : `Couldn't answer: ${json.error}`, tools: json.toolCalls }]);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-rule bg-sheet p-5">
      {messages.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="rounded-full border border-rule px-4 py-2 text-left text-sm hover:border-passbook hover:text-passbook"
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <ol className="space-y-4" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={m.role === "user" ? "text-right" : ""}>
              <p
                className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-left ${
                  m.role === "user" ? "bg-passbook text-white" : "bg-paper"
                }`}
              >
                {m.content}
              </p>
              {m.tools && m.tools.length > 0 && (
                <p className="mt-1 text-xs text-ink-soft">Checked: {[...new Set(m.tools)].join(", ")}</p>
              )}
            </li>
          ))}
          {busy && <li className="text-ink-soft">Tend is checking…</li>}
        </ol>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="mt-4 flex gap-2"
      >
        <label className="sr-only" htmlFor="ask">Ask Tend</label>
        <input
          id="ask"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the pot, or tell Tend to pay something"
          className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-rule bg-paper px-4"
        />
        <button disabled={busy} className="min-h-12 rounded-xl bg-passbook px-5 font-bold text-white disabled:opacity-60">
          Ask
        </button>
      </form>
    </div>
  );
}
