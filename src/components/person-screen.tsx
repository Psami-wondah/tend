"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Live } from "./live";
import {
  Camera,
  Mic,
  MessageSquareText,
  Volume2,
  VolumeX,
  CircleCheck,
  Hourglass,
  OctagonX,
  TriangleAlert,
  Check,
  PauseCircle,
  Send,
  Repeat,
} from "lucide-react";
import { Dial, useNow } from "./clock";
import { Txt } from "./figures-text";
import { PayPalApprove } from "./paypal-approve";
import { canSpeak, speak, stopSpeaking } from "./speak";
import { isDaytimeHour, localTime } from "@/lib/time";

type Outcome =
  | "paid"
  | "paying"
  | "awaiting_approval"
  | "on_hold"
  | "refused"
  | "warning"
  | "nothing_to_pay"
  | "failed"
  | "held"
  | "need_payee"
  | "approve";
type Result = { outcome: Outcome; message: string };
type Plan = { intentId: string; orderId: string; message: string; decision: string; holdHours: number; reasons: string[] };
type Mode = "home" | "speak" | "type" | "thinking" | "plan" | "result";
type Route = "pot" | "own";
type Person = { id: string; name: string; city: string | null; timezone: string | null; color: string | null; role: string; relation: string | null };
export type PersonRecent = { id: string; line: string; tone: "paid" | "wait" | "stop" | "quiet"; when: string };
export type Sample = { id: string; label: string; route: Route; kind: "image" | "voice" | "text"; src?: string; text?: string };

// Two-value contrast: every result is ink on a light field or a strong field with its own ink.
const TONE: Record<Exclude<Outcome, "approve">, { panel: string; heading: string; Icon: typeof Check }> = {
  paid: { panel: "bg-paid text-paid-ink", heading: "Paid", Icon: CircleCheck },
  paying: { panel: "bg-paid text-paid-ink", heading: "Paying now", Icon: CircleCheck },
  awaiting_approval: { panel: "bg-dial text-ink border-4 border-wait", heading: "I've asked your circle", Icon: Hourglass },
  on_hold: { panel: "bg-dial text-ink border-4 border-wait", heading: "Waiting for a top-up", Icon: Hourglass },
  held: { panel: "bg-dial text-ink border-4 border-wait", heading: "Held for now", Icon: PauseCircle },
  refused: { panel: "bg-stop text-stop-ink", heading: "Not paid", Icon: OctagonX },
  warning: { panel: "bg-stop text-stop-ink", heading: "Please be careful", Icon: TriangleAlert },
  nothing_to_pay: { panel: "bg-dial text-ink border-4 border-rule-strong", heading: "Nothing to pay", Icon: Check },
  need_payee: { panel: "bg-dial text-ink border-4 border-wait", heading: "Who's it for?", Icon: Send },
  failed: { panel: "bg-dial text-ink border-4 border-stop", heading: "I couldn't do that", Icon: TriangleAlert },
};

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

function readPref(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: keep it for this visit only */
  }
}

async function post(url: string, data: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

/**
 * The screen for the person at the centre: a parent, an uncle, anyone whose
 * money their circle helps protect. Big type, two-value contrast, spoken
 * answers, one decision per screen. They stay in charge of their own money.
 */
export function PersonScreen(props: {
  memberId: string;
  name: string;
  circle: Person[];
  recent: PersonRecent[];
  samples: Sample[];
  initialNow: number;
  demo: boolean;
  paypalMode: "sandbox" | "live" | "simulated";
  currency: string;
  potEnabled: boolean;
  vault: { saved: boolean; summary: string | null; payees: { id: string; name: string }[] };
  vaultNotice: string | null;
  /** How long unusual payments wait, in words: "for a day". */
  hold: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("home");
  const [route, setRoute] = useState<Route>(props.potEnabled ? "pot" : "own");
  const [result, setResult] = useState<Result | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [size, setSize] = useState("1");
  const [voice, setVoice] = useState(true);
  const [payTo, setPayTo] = useState("");
  const [pending, setPending] = useState<{ source: "photo" | "voice" | "text"; text?: string; imageDataUrl?: string; sampleId?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const now = useNow(props.initialNow);
  const names = props.circle.map((p) => p.name);
  const circleNames = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "your circle";

  useEffect(() => {
    setSize(readPref("tend.person.size", "1"));
    setVoice(readPref("tend.person.voice", "on") === "on");
  }, []);

  useEffect(() => {
    if (mode === "result" && result && result.outcome !== "approve") {
      headingRef.current?.focus();
      if (voice) speak(`${TONE[result.outcome].heading}. ${result.message}`);
    }
    if (mode === "plan" && plan) {
      headingRef.current?.focus();
      if (voice) speak(`Before you pay. ${plan.message}`);
    }
  }, [mode, result, plan, voice]);

  function show(outcome: Outcome, message: string) {
    setResult({ outcome, message });
    setMode("result");
    router.refresh();
  }

  async function submit(payload: { source: "photo" | "voice" | "text"; text?: string; imageDataUrl?: string; sampleId?: string }, via: Route = route, email?: string) {
    setMode("thinking");
    setPending(payload);
    try {
      if (via === "pot") {
        const { json } = await post("/api/intake", { ...payload, submittedBy: props.memberId });
        return show(json.outcome ?? "failed", json.message ?? "Please try again.");
      }
      const { json } = await post("/api/own/start", { ...payload, payerId: props.memberId, payToEmail: email || undefined });
      if (json.outcome === "approve") {
        setPlan({ intentId: json.intentId, orderId: json.orderId, message: json.message, decision: json.plan?.decision ?? "auto_pay", holdHours: json.plan?.holdHours ?? 0, reasons: json.plan?.reasons ?? [] });
        setMode("plan");
        return;
      }
      show(json.outcome ?? "failed", json.message ?? json.error ?? "Please try again.");
    } catch {
      show("failed", "I couldn't reach Tend. Check the internet connection and try again.");
    }
  }

  async function confirm(orderId: string) {
    if (!plan) return;
    const { json } = await post(`/api/own/${plan.intentId}/confirm`, { orderId });
    setPlan(null);
    show(json.outcome ?? "failed", json.message ?? json.error ?? "Please try again.");
  }

  async function cancelPlan() {
    if (plan) await post(`/api/own/${plan.intentId}/stop`, { memberId: props.memberId, note: "Changed my mind" });
    setPlan(null);
    reset();
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    const url = await toDataUrl(file);
    setPreview(url);
    await submit({ source: "photo", imageDataUrl: url });
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
    stopSpeaking();
    setText("");
    setResult(null);
    setPlan(null);
    setPreview(null);
    setPayTo("");
    setPending(null);
    setRoute(props.potEnabled ? "pot" : "own");
    setMode("home");
  }

  async function sample(s: Sample) {
    setRoute(s.route);
    if (s.kind !== "image") return submit({ source: s.kind, text: s.text, sampleId: s.id }, s.route);
    const blob = await (await fetch(s.src!)).blob();
    const url = await toDataUrl(blob);
    setPreview(url);
    await submit({ source: "photo", imageDataUrl: url, sampleId: s.id }, s.route);
  }

  function cycleSize() {
    const next = size === "1" ? "2" : size === "2" ? "3" : "1";
    setSize(next);
    writePref("tend.person.size", next);
  }
  function toggleVoice() {
    const next = !voice;
    setVoice(next);
    writePref("tend.person.voice", next ? "on" : "off");
    if (!next) stopSpeaking();
  }

  const bigButton = "flex min-h-26 items-center gap-4 rounded-3xl px-5 py-5 text-left text-[1.45em] leading-tight font-bold transition-colors duration-200 sm:px-6";

  return (
    <div data-mum-size={size} className="min-h-dvh bg-enamel leading-snug text-ink">
      <Live />
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8">
        <header className="flex items-center gap-2 border-b border-rule pb-5">
          <span className="font-display text-[1.75em] leading-none font-semibold tracking-[-0.035em] text-accent">Tend</span>
          <button
            type="button"
            onClick={cycleSize}
            className="ml-auto min-h-13 min-w-14 rounded-2xl border-2 border-rule-strong bg-dial px-3 font-display text-[0.8em] font-semibold hover:border-ink"
            aria-label={`Text size ${size} of 3. Press to change.`}
          >
            A<span className="text-[1.25em]">A</span>
          </button>
          <button
            type="button"
            onClick={toggleVoice}
            aria-pressed={voice}
            className="grid min-h-13 min-w-14 place-items-center rounded-2xl border-2 border-rule-strong bg-dial hover:border-ink"
            aria-label={voice ? "Reading answers aloud. Press to stop." : "Not reading answers aloud. Press to start."}
          >
            {voice ? <Volume2 aria-hidden size={24} /> : <VolumeX aria-hidden size={24} />}
          </button>
        </header>

        {mode === "home" && (
          <>
            <h1 className="mt-8 font-display text-[2.4em] leading-[1.08] font-semibold tracking-[-0.025em]"><span className="mb-2 block text-[0.6em] leading-tight text-ink-soft">Hello {props.name}.</span>{" "}What needs paying?</h1>
            {props.vaultNotice && <p role="status" className="mt-4 border-l-4 border-paid p-4 font-bold text-paid">{props.vaultNotice}</p>}
            <div className="mt-7 grid gap-3">
              <button type="button" onClick={() => fileRef.current?.click()} className={`${bigButton} bg-action text-action-ink shadow-[0_8px_20px_-12px_rgb(8_46_63/0.5)] hover:bg-action-hover`}>
                <Camera aria-hidden size={36} strokeWidth={2} className="shrink-0" />
                <span className="text-balance">Take a photo of a bill</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => onPhoto(e.target.files?.[0])} />
              <button type="button" onClick={startListening} className={`${bigButton} color-scene border-2 border-feature-ink/20 bg-sea text-feature-ink shadow-[0_8px_20px_-14px_rgb(8_46_63/0.4)] hover:border-feature-ink`}>
                <Mic aria-hidden size={34} strokeWidth={2} className="shrink-0" />
                Tell me out loud
              </button>
              <button type="button" onClick={() => setMode("type")} className="flex min-h-24 items-center gap-4 rounded-3xl border-2 border-rule-strong bg-dial px-5 py-5 text-left text-[1.2em] leading-tight font-bold shadow-[0_6px_16px_-14px_rgb(8_46_63/0.45)] transition-colors duration-200 hover:border-ink sm:px-6">
                <MessageSquareText aria-hidden size={30} strokeWidth={2} className="shrink-0" />
                <span className="text-balance">Check a message or email someone sent me</span>
              </button>
              {props.potEnabled && (
                <button
                  type="button"
                  onClick={() => {
                    setRoute("own");
                    setMode("type");
                  }}
                  className="flex min-h-24 items-center gap-4 rounded-3xl border-2 border-rule-strong bg-dial px-5 py-5 text-left text-[1.2em] leading-tight font-bold shadow-[0_6px_16px_-14px_rgb(8_46_63/0.45)] transition-colors duration-200 hover:border-ink sm:px-6"
                >
                  <Send aria-hidden size={28} strokeWidth={2} className="shrink-0" />
                  <span className="text-balance">Pay someone from my own PayPal</span>
                </button>
              )}
            </div>
            <p className="mt-6 border-l-4 border-accent/35 pl-4 text-[1em] leading-relaxed">
              {props.potEnabled
                ? `I pay what your circle agreed from the shared pot, and ask ${circleNames} about anything else.`
                : `It's your money. I pay what you ask, and hold anything unusual ${props.hold} so ${circleNames} can take a look.`}{" "}
              I never send money to strangers who ask for gift cards, crypto or wire transfers.
            </p>

            {props.vault.payees.length > 0 && <VaultCard memberId={props.memberId} vault={props.vault} simulated={props.paypalMode === "simulated"} currency={props.currency} />}

            {props.recent.length > 0 && (
              <section className="mt-10" aria-labelledby="lately">
                <h2 id="lately" className="font-display text-[1.3em] font-semibold">What I&apos;ve done lately</h2>
                <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-3xl border border-rule bg-dial shadow-[0_10px_28px_-22px_rgb(25_47_57/0.3)]">
                  {props.recent.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 px-5 py-5">
                      <RecentIcon tone={r.tone} />
                      <span className="min-w-0">
                        <span className="block font-bold">
                          <Txt>{r.line}</Txt>
                        </span>
                        <span className="block text-[0.85em] text-ink-soft">{r.when}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="color-scene mt-10 rounded-3xl border border-feature-ink/10 bg-sea p-5 text-feature-ink sm:p-6" aria-labelledby="fam">
              <h2 id="fam" className="font-display text-[1.3em] font-semibold">Your circle right now</h2>
              <ul className={`mt-4 grid gap-3 ${props.circle.length >= 3 ? "grid-cols-2 min-[480px]:grid-cols-3" : "grid-cols-2"}`}>
                {props.circle.map((p) => {
                  const t = localTime(p.timezone, now);
                  const asleep = !isDaytimeHour(t.hour);
                  return (
                    <li key={p.id} className="flex min-w-0 flex-col items-center px-2 py-4 text-center break-words">
                      <Dial person={p} now={now} size={68} />
                      <span className="mt-3 max-w-full font-bold">{p.name}</span>
                      <span className="text-[0.8em] text-ink-soft">
                        {p.relation ? `${p.relation}, ` : ""}
                        {asleep ? "asleep" : "awake"} in {p.city}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {props.samples.length > 0 && (
              <details className="mt-auto pt-10 text-[0.85em]">
                <summary className="min-h-14 cursor-pointer border-t border-rule pt-4 font-bold underline underline-offset-4">Try it with an example</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  {props.samples.map((s) => (
                    <button key={s.id} type="button" onClick={() => sample(s)} className="min-h-14 rounded-2xl border-2 border-rule-strong bg-dial px-4 py-2 text-left font-bold hover:border-ink">
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="mt-4">
                  This is an example circle.{" "}
                  <Link href="/demo" className="underline underline-offset-4">
                    Open it as someone else
                  </Link>
                  {props.demo && <span className="text-ink-soft">. PayPal is simulated.</span>}
                </p>
              </details>
            )}
          </>
        )}

        {(mode === "speak" || mode === "type") && (
          <form
            className="mt-8 flex flex-1 flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              recRef.current?.stop();
              if (text.trim()) void submit({ source: mode === "speak" ? "voice" : "text", text });
            }}
          >
            <label htmlFor="what" className="font-display text-[1.8em] leading-tight font-semibold">
              {mode === "speak" ? (listening ? "I'm listening…" : "Say it, or type it here") : route === "own" && props.potEnabled ? "Who are you paying, and how much?" : "Paste or type it here"}
            </label>
            {listening && (
              <p role="status" className="flex items-center gap-2 font-bold text-stop">
                <span aria-hidden className="pulse-dot size-3 rounded-full bg-stop" /> Recording
              </p>
            )}
            <textarea
              id="what"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              className="w-full min-w-0 rounded-3xl border-2 border-ink bg-dial p-5 text-[1.15em] leading-relaxed"
              placeholder={mode === "speak" ? "The taxi to my eye appointment was eighteen dollars…" : "Paste the text or email here"}
            />
            <button disabled={!text.trim()} className="min-h-24 rounded-3xl bg-action px-5 py-4 text-[1.5em] font-bold text-action-ink hover:bg-action-hover disabled:opacity-50">
              Send to Tend
            </button>
            <button type="button" onClick={reset} className="min-h-14 text-[1.1em] font-bold underline underline-offset-4">
              Go back
            </button>
          </form>
        )}

        {mode === "thinking" && (
          <div role="status" aria-live="polite" className="mt-10 flex flex-col items-center text-center">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="The photo you sent" className="max-h-64 rounded-2xl border border-rule" />
            )}
            <p className="mt-8 flex items-center gap-3 font-display text-[2em] font-semibold">
              <span aria-hidden className="pulse-dot size-4 rounded-full bg-action" />
              Reading it now…
            </p>
            <p className="mt-2">This takes a few seconds.</p>
          </div>
        )}

        {mode === "plan" && plan && (
          <section aria-live="assertive" className="mt-4 flex flex-1 flex-col">
            {/* Sized so the card and both buttons fit on a phone at the default text size. */}
            <div className="rounded-3xl border-4 border-accent bg-dial p-5 sm:p-7">
              {plan.decision === "auto_pay" ? <CircleCheck aria-hidden size={36} /> : <PauseCircle aria-hidden size={36} />}
              <h1 ref={headingRef} tabIndex={-1} className="mt-3 font-display text-[2.2em] leading-[1.08] font-semibold tracking-[-0.025em] outline-none">
                Before you pay
              </h1>
              <p className="mt-3 text-[1.2em] leading-snug">
                <Txt>{plan.message}</Txt>
              </p>
              {plan.reasons.length > 0 && plan.decision !== "auto_pay" && (
                <ul className="mt-4 space-y-3 border-t border-rule pt-4 text-[0.95em]">
                  {plan.reasons.slice(0, 1).map((r) => (
                    <li key={r} className="flex gap-2">
                      <Hourglass aria-hidden size={20} className="mt-1 shrink-0 text-wait" />
                      <span>
                        <Txt>{r}</Txt>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-4">
              <PayPalApprove
                big
                simulated={props.paypalMode === "simulated"}
                currency={props.currency}
                simulatedLabel="Approve with PayPal"
                createOrder={async () => plan.orderId}
                onApproved={confirm}
                onError={(m) => show("failed", m)}
              />
            </div>
            <button type="button" onClick={cancelPlan} className="mt-3 min-h-20 rounded-3xl border-2 border-ink bg-dial px-5 py-3 text-[1.2em] font-bold">
              Don&apos;t pay it
            </button>
          </section>
        )}

        {mode === "result" && result && result.outcome !== "approve" && (
          <section aria-live="assertive" className="mt-8 flex flex-1 flex-col">
            <div className={`rise rounded-3xl p-5 sm:p-7 ${TONE[result.outcome].panel}`}>
              {(() => {
                const T = TONE[result.outcome];
                return <T.Icon aria-hidden size={56} strokeWidth={2} />;
              })()}
              <h1 ref={headingRef} tabIndex={-1} className="mt-4 font-display text-[2.6em] leading-[1.08] font-semibold tracking-[-0.025em] outline-none">
                {TONE[result.outcome].heading}
              </h1>
              <p className="mt-4 text-[1.25em] leading-relaxed">
                <Txt>{result.message}</Txt>
              </p>
            </div>
            {result.outcome === "need_payee" && pending && (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit(pending, "own", payTo);
                }}
              >
                <label htmlFor="payto" className="block text-[1.1em] font-bold">
                  Their PayPal email
                </label>
                <input id="payto" type="email" inputMode="email" required value={payTo} onChange={(e) => setPayTo(e.target.value)} className="min-h-16 w-full rounded-2xl border-4 border-ink bg-dial px-4 text-[1.1em]" />
                <button className="min-h-16 w-full rounded-3xl bg-action text-[1.3em] font-bold text-action-ink">Carry on</button>
              </form>
            )}
            {canSpeak() && (
              <button type="button" onClick={() => speak(`${TONE[result.outcome as Exclude<Outcome, "approve">].heading}. ${result.message}`)} className="mt-4 flex min-h-16 items-center justify-center gap-3 rounded-3xl border-2 border-ink bg-dial text-[1.2em] font-bold">
                <Volume2 aria-hidden size={26} /> Read it again
              </button>
            )}
            <button type="button" onClick={reset} className="mt-3 min-h-24 rounded-3xl bg-action px-5 py-4 text-[1.5em] font-bold text-action-ink hover:bg-action-hover">
              Done
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

function VaultCard({ memberId, vault, simulated, currency }: { memberId: string; vault: { saved: boolean; summary: string | null; payees: { id: string; name: string }[] }; simulated: boolean; currency: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limit = 60;
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(limit);
  async function save() {
    setBusy(true);
    setError(null);
    const { ok, json } = await post("/api/vault/setup", { memberId, maxPerPayment: limit, payeeIds: vault.payees.map((p) => p.id) });
    setBusy(false);
    if (!ok) return setError(json.error ?? "Couldn't start that.");
    if (json.approveUrl) window.location.href = json.approveUrl;
    else router.refresh();
  }
  async function revoke() {
    setBusy(true);
    await post("/api/vault/revoke", { memberId });
    setBusy(false);
    router.refresh();
  }
  return (
    <section className="mt-10 rounded-3xl border-2 border-rule-strong bg-dial p-5 sm:p-6" aria-labelledby="regular">
      <h2 id="regular" className="flex items-center gap-2 font-display text-[1.3em] font-semibold">
        <Repeat aria-hidden size={24} /> Regular bills
      </h2>
      {vault.saved ? (
        <>
          <p className="mt-2">
            <Txt>{vault.summary ?? ""}</Txt>
          </p>
          <button type="button" onClick={revoke} disabled={busy} className="mt-4 min-h-20 rounded-2xl border-2 border-ink px-5 py-3 text-left font-bold">
            {busy ? "Stopping…" : "Stop paying these automatically"}
          </button>
        </>
      ) : (
        <>
          <p className="mt-2">
            <Txt>{`Save your PayPal once, and I'll pay ${vault.payees.map((p) => p.name).join(" and ")} for you, up to ${fmt} a time. Your circle's rules still apply, and you can stop it whenever you like.`}</Txt>
          </p>
          <button type="button" onClick={save} disabled={busy} className="mt-4 min-h-20 w-full rounded-2xl bg-action px-4 py-3 text-[1.15em] font-bold text-action-ink">
            {busy ? "Opening PayPal…" : simulated ? "Save my PayPal (simulated)" : "Save my PayPal"}
          </button>
          {error && <p role="alert" className="mt-2 font-bold text-stop">{error}</p>}
        </>
      )}
    </section>
  );
}

function RecentIcon({ tone }: { tone: PersonRecent["tone"] }) {
  const map = {
    paid: { Icon: CircleCheck, cls: "text-paid" },
    wait: { Icon: Hourglass, cls: "text-wait" },
    stop: { Icon: OctagonX, cls: "text-stop" },
    quiet: { Icon: Check, cls: "text-ink-soft" },
  }[tone];
  return <map.Icon aria-hidden size={26} strokeWidth={2.25} className={`mt-0.5 shrink-0 ${map.cls}`} />;
}
