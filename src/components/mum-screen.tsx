"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type Outcome = "paid" | "paying" | "awaiting_approval" | "on_hold" | "refused" | "warning" | "nothing_to_pay" | "failed";
type Result = { outcome: Outcome; message: string };
type Mode = "home" | "speak" | "type" | "thinking" | "result";

const TONE: Record<Outcome, { panel: string; heading: string }> = {
  paid: { panel: "bg-passbook text-white", heading: "Paid" },
  paying: { panel: "bg-passbook text-white", heading: "Paying now" },
  awaiting_approval: { panel: "bg-marigold-tint text-ink", heading: "Asked the family" },
  on_hold: { panel: "bg-marigold-tint text-ink", heading: "Waiting for a top-up" },
  refused: { panel: "bg-brick text-white", heading: "Not paid" },
  warning: { panel: "bg-brick text-white", heading: "Be careful" },
  nothing_to_pay: { panel: "bg-sheet text-ink", heading: "Nothing to pay" },
  failed: { panel: "bg-brick-tint text-ink", heading: "Something went wrong" },
};

const SAMPLES = [
  { label: "Pharmacy receipt", kind: "image" as const, src: "/samples/pharmacy-receipt.png" },
  { label: "Carer's invoice", kind: "image" as const, src: "/samples/carer-invoice.png" },
  {
    label: "A worrying text",
    kind: "text" as const,
    text: "Grandma its me, I lost my phone this is my new number. I'm in trouble and need $1,500 today for a lawyer. Please don't tell mum, she'll be so angry. Can you buy Apple gift cards and send me photos of the codes? I'll pay you back I promise x",
  },
];

/** Shrink a photo so it uploads quickly from a phone and stays legible to the model. */
async function toDataUrl(blob: Blob, max = 1600): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function MumScreen({ memberId, name }: { memberId: string | null; name: string }) {
  const [mode, setMode] = useState<Mode>("home");
  const [result, setResult] = useState<Result | null>(null);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);

  async function submit(payload: { source: "photo" | "voice" | "text"; text?: string; imageDataUrl?: string }) {
    setMode("thinking");
    const res = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, submittedBy: memberId }),
    });
    const json = await res.json();
    setResult(res.ok ? json : { outcome: "failed", message: json.error ?? "Please try again." });
    setMode("result");
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    await submit({ source: "photo", imageDataUrl: await toDataUrl(file) });
  }

  function startListening() {
    type Rec = {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setMode("speak");
    if (!Ctor) return; // falls back to typing below
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => setText(Array.from(e.results).map((r) => r[0].transcript).join(" "));
    rec.onend = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }

  function reset() {
    recRef.current?.stop();
    setText("");
    setResult(null);
    setMode("home");
  }

  async function sample(s: (typeof SAMPLES)[number]) {
    if (s.kind === "text") return submit({ source: "text", text: s.text });
    const blob = await (await fetch(s.src)).blob();
    await submit({ source: "photo", imageDataUrl: await toDataUrl(blob) });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 py-6 text-xl sm:text-2xl">
      <header className="flex items-center justify-between">
        <span className="text-3xl font-extrabold text-passbook">Tend</span>
        <Link href="/" className="text-base text-ink-soft underline underline-offset-4">
          Family view
        </Link>
      </header>

      {mode === "home" && (
        <>
          <h1 className="mt-8 text-4xl font-extrabold leading-tight sm:text-5xl">Hello {name}. What do you need paying?</h1>
          <div className="mt-8 grid gap-4">
            <button
              onClick={() => fileRef.current?.click()}
              className="min-h-24 rounded-3xl bg-passbook px-6 text-left text-3xl font-extrabold text-white hover:bg-passbook-deep"
            >
              Take a photo of a bill
            </button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
            <button
              onClick={startListening}
              className="min-h-24 rounded-3xl border-4 border-passbook bg-sheet px-6 text-left text-3xl font-extrabold text-passbook"
            >
              Tell me out loud
            </button>
            <button onClick={() => setMode("type")} className="min-h-20 rounded-3xl border-2 border-rule bg-sheet px-6 text-left text-2xl font-bold">
              Paste a message someone sent me
            </button>
          </div>
          <p className="mt-8 text-lg text-ink-soft">
            I&apos;ll pay what the family has agreed, ask them about anything else, and never send money to strangers.
          </p>
          <details className="mt-auto pt-10 text-base text-ink-soft">
            <summary className="cursor-pointer font-bold">Try with an example</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {SAMPLES.map((s) => (
                <button key={s.label} onClick={() => sample(s)} className="min-h-11 rounded-full border border-rule bg-sheet px-4 font-bold">
                  {s.label}
                </button>
              ))}
            </div>
          </details>
        </>
      )}

      {(mode === "speak" || mode === "type") && (
        <form
          className="mt-8 flex flex-1 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            recRef.current?.stop();
            if (text.trim()) void submit({ source: mode === "speak" ? "voice" : "text", text });
          }}
        >
          <label htmlFor="what" className="text-3xl font-extrabold">
            {mode === "speak" ? (listening ? "I'm listening…" : "Say it, or type it here") : "Paste or type the message"}
          </label>
          <textarea
            id="what"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            className="rounded-2xl border-4 border-rule bg-sheet p-4 text-2xl leading-relaxed"
            placeholder={mode === "speak" ? "The taxi to my eye appointment was eighteen dollars…" : ""}
          />
          <button disabled={!text.trim()} className="min-h-20 rounded-3xl bg-passbook text-3xl font-extrabold text-white disabled:opacity-50">
            Send to Tend
          </button>
          <button type="button" onClick={reset} className="min-h-14 text-xl font-bold underline underline-offset-4">
            Go back
          </button>
        </form>
      )}

      {mode === "thinking" && (
        <div role="status" className="mt-16 text-center">
          <p className="text-4xl font-extrabold">Reading it now…</p>
          <p className="mt-3 text-ink-soft">This takes a few seconds.</p>
        </div>
      )}

      {mode === "result" && result && (
        <section aria-live="assertive" className="mt-8 flex flex-1 flex-col">
          <div className={`rounded-3xl p-7 ${TONE[result.outcome].panel}`}>
            <h1 className="text-5xl font-extrabold">{TONE[result.outcome].heading}</h1>
            <p className="mt-4 text-2xl leading-relaxed">{result.message}</p>
          </div>
          <button onClick={reset} className="mt-6 min-h-20 rounded-3xl border-4 border-passbook bg-sheet text-3xl font-extrabold text-passbook">
            Done
          </button>
        </section>
      )}
    </main>
  );
}
