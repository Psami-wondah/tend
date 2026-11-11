"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, MessageCircle, TriangleAlert, Undo2 } from "lucide-react";
import type { Mandate } from "@/lib/mandate/types";
import { CATEGORIES } from "@/lib/mandate/types";
import { categoryLabel, diffMandates, EDITABLE_METHODS, readRule, validateMandate, writeRule, type RuleChange, type RuleValue } from "@/lib/mandate/edit";
import { humanMethod } from "@/lib/mandate/engine";
import { formatMoney } from "@/lib/money";
import { btn, field } from "./ui";

type History = { version: number; by: string; at: string; changes: { label: string; display: string; loosens: boolean }[] }[];

async function post(url: string, data: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

export function RulesEditor(props: {
  mandate: Mandate;
  memberId: string;
  currency: string;
  spent: Record<string, number>;
  history: History;
  initialAsk: string | null;
  aiLive: boolean;
  who: string;
  pot: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Mandate>(props.mandate);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const changes = useMemo(() => diffMandates(props.mandate, draft, props.currency), [props.mandate, draft, props.currency]);
  const problems = useMemo(() => validateMandate(draft), [draft]);

  useEffect(() => setDraft(props.mandate), [props.mandate]);

  function set(path: string, value: RuleValue) {
    try {
      setDraft((d) => writeRule(d, path, value));
      setStatus(null);
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const r = await post("/api/rules", { memberId: props.memberId, mandate: draft });
      setStatus({ ok: true, text: `Saved as version ${r.version}. Everyone in the circle has been told.` });
      router.refresh();
    } catch (e) {
      setStatus({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  const money = (minor: number) => formatMoney(minor, props.currency);

  return (
    <div className="space-y-10 pb-28">
      <PlainEnglish
        initialAsk={props.initialAsk}
        aiLive={props.aiLive}
        onPropose={(next) => {
          setDraft(next);
          document.getElementById("review")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      />

      <section aria-labelledby="own">
        <h2 id="own" className="font-display text-2xl font-medium tracking-[-0.02em]">When {props.who} pays from their own PayPal</h2>
        <p className="mt-2 leading-relaxed text-ink-soft">
          It&apos;s {props.who}&apos;s money. Tend never says no to an ordinary payment; it buys the circle time. Unusual payments are authorized in PayPal but held, and anyone in the circle can stop them.
        </p>
        <div className="mt-5 divide-y divide-rule overflow-hidden surface-card rounded-3xl border border-rule bg-dial">
          <div className="px-5 py-5 sm:px-6">
            <p className="text-sm font-bold">Hold unusual payments for</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="How long to hold">
              {[12, 24, 48, 71].map((h) => {
                const on = Number(readRule(draft, "ownPayments.coolingOffHours")) === h;
                return (
                  <button
                    key={h}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("ownPayments.coolingOffHours", h)}
                    className={`figures min-h-12 rounded-xl border-2 text-base font-medium ${on ? "border-action bg-action text-action-ink" : "border-rule bg-dial hover:border-ink"}`}
                  >
                    {h === 71 ? "3 days" : `${h} hours`}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-ink-soft">PayPal holds an authorization for up to three days before it must be captured, so three days is the longest Tend can wait.</p>
          </div>
          <div className="grid gap-5 px-5 py-5 sm:px-6 sm:grid-cols-2">
            <MoneyInput label="Hold any payment over" minor={Number(readRule(draft, "ownPayments.coolOffOverMinor"))} onChange={(v) => set("ownPayments.coolOffOverMinor", v ?? 0)} />
            <MoneyInput label="Need one person's yes over" minor={Number(readRule(draft, "ownPayments.approvalOverMinor"))} onChange={(v) => set("ownPayments.approvalOverMinor", v ?? 0)} />
          </div>
          <label className="flex min-h-20 items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <span>
              <span className="block font-bold">Hold their first payment to anyone new</span>
              <span className="mt-1 block text-[0.9375rem] leading-relaxed text-ink-soft">The roofer at the door, a new website, a stranger&apos;s PayPal.</span>
            </span>
            <Toggle checked={Boolean(readRule(draft, "ownPayments.holdNewPayees"))} onChange={(v) => set("ownPayments.holdNewPayees", v)} label="Hold their first payment to anyone new" />
          </label>
        </div>
      </section>

      {props.pot && (
      <>
      <section aria-labelledby="auto">
        <h2 id="auto" className="font-display text-2xl font-medium tracking-[-0.02em]">What Tend pays without asking</h2>
        <p className="mt-2 leading-relaxed text-ink-soft">At or under the limit, Tend pays a verified payee straight away. Set 0 to always ask. A monthly budget makes Tend ask once the month&apos;s spending would go over it.</p>
        <ul className="mt-5 divide-y divide-rule overflow-hidden surface-card rounded-3xl border border-rule bg-dial">
          {CATEGORIES.map((c) => {
            const limit = Number(readRule(draft, `categories.${c}.autoPayUpToMinor`));
            const budget = readRule(draft, `categories.${c}.monthlyBudgetMinor`) as number | null;
            const spent = props.spent[c] ?? 0;
            return (
              <li key={c} className="grid gap-5 px-5 py-5 sm:px-6 sm:grid-cols-[9rem_1fr_1fr] sm:items-center">
                <div>
                  <p className="font-bold">{categoryLabel(c)}</p>
                  {spent > 0 && <p className="figures text-sm text-ink-soft">{money(spent)} this month</p>}
                </div>
                <MoneyInput label="Auto-pay up to" minor={limit} onChange={(v) => set(`categories.${c}.autoPayUpToMinor`, v ?? 0)} hint={limit === 0 ? "Always asks" : undefined} />
                <div>
                  <MoneyInput label="Monthly budget" minor={budget} optional onChange={(v) => set(`categories.${c}.monthlyBudgetMinor`, v)} hint={budget === null ? "No budget" : undefined} />
                  {budget !== null && budget > 0 && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-enamel" aria-hidden>
                      <div className={`h-full rounded-full ${spent > budget ? "bg-stop" : spent > budget * 0.8 ? "bg-wait" : "bg-paid"}`} style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="ask">
        <h2 id="ask" className="font-display text-2xl font-medium tracking-[-0.02em]">When the circle has to say yes</h2>
        <div className="mt-5 divide-y divide-rule overflow-hidden surface-card rounded-3xl border border-rule bg-dial">
          <div className="grid gap-5 px-5 py-5 sm:px-6 sm:grid-cols-2 sm:items-end">
            <MoneyInput label="A payment is large when it's over" minor={draft.largePaymentOverMinor} onChange={(v) => set("largePaymentOverMinor", v ?? 0)} />
            <Stepper label="Large payments need" value={draft.largePaymentApprovals} onChange={(v) => set("largePaymentApprovals", v)} />
          </div>
          <div className="px-5 py-5 sm:px-6">
            <Stepper label="Everything else that needs an OK needs" value={draft.defaultApprovals} onChange={(v) => set("defaultApprovals", v)} />
          </div>
          <label className="flex min-h-20 items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <span>
              <span className="block font-bold">Ask before paying someone new</span>
              <span className="mt-1 block text-[0.9375rem] leading-relaxed text-ink-soft">The first payment to any payee waits for the circle.</span>
            </span>
            <Toggle checked={draft.newPayeeRequiresApproval} onChange={(v) => set("newPayeeRequiresApproval", v)} label="Ask before paying someone new" />
          </label>
        </div>
      </section>

      </>
      )}

      <section aria-labelledby="never">
        <h2 id="never" className="font-display text-2xl font-medium tracking-[-0.02em]">Ways Tend never pays</h2>
        <p className="mt-2 leading-relaxed text-ink-soft">These are how most scams take money from older people. Tend refuses them whoever asks.</p>
        <ul className="mt-5 divide-y divide-rule overflow-hidden surface-card rounded-3xl border border-rule bg-dial">
          {EDITABLE_METHODS.map((m) => {
            const locked = m === "gift_card";
            const on = Boolean(readRule(draft, `blockedMethods.${m}`));
            return (
              <li key={m}>
                <label className="flex min-h-20 items-center justify-between gap-4 px-5 py-4 sm:px-6">
                  <span className="font-bold first-letter:uppercase">
                    {humanMethod(m)}
                    {locked && (
                      <span className="ml-2 inline-flex items-center gap-1 text-sm font-normal text-ink-soft">
                        <Lock aria-hidden size={13} /> always blocked
                      </span>
                    )}
                  </span>
                  <Toggle checked={on} disabled={locked} onChange={(v) => set(`blockedMethods.${m}`, v)} label={`Block ${humanMethod(m)}`} onLabel="Blocked" offLabel="Allowed" />
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="scam">
        <h2 id="scam" className="font-display text-2xl font-medium tracking-[-0.02em]">How careful to be with scams</h2>
        <p className="mt-2 leading-relaxed text-ink-soft">The AI scores each request for scam signals from 0 to 100%. Lower numbers make Tend more careful. Refusing outright also needs a sign with no innocent version: someone posing as family or an official, a request for secrecy, or gift cards, crypto or wire. Otherwise a risky request waits for a yes.</p>
        <div className="mt-5 space-y-7 surface-card rounded-3xl border border-rule bg-dial p-5 sm:p-6">
          <Slider label="Ask the circle when the risk is at least" value={draft.scamReviewThreshold} onChange={(v) => set("scamReviewThreshold", v)} />
          <Slider label="Refuse outright when the risk is at least" value={draft.scamRefuseThreshold} onChange={(v) => set("scamRefuseThreshold", v)} />
        </div>
      </section>

      <HistoryList history={props.history} memberId={props.memberId} current={props.mandate.version} />

      {(changes.length > 0 || status) && (
        <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 px-3 lg:bottom-4">
          <div id="review" className="rise mx-auto max-h-[60dvh] max-w-3xl overflow-y-auto overscroll-contain rounded-3xl border-2 border-action bg-dial p-5">
            {changes.length > 0 && <ChangeList changes={changes} />}
            {problems.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm font-bold text-stop">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {status && <p role="status" className={`mt-2 font-bold ${status.ok ? "text-paid" : "text-stop"}`}>{status.text}</p>}
            {changes.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-3 border-t border-rule pt-4">
                <button type="button" onClick={save} disabled={saving || problems.length > 0} className={btn.primary}>
                  {saving ? "Saving…" : `Save ${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
                </button>
                <button type="button" onClick={() => setDraft(props.mandate)} className={btn.secondary}>
                  Undo
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeList({ changes }: { changes: RuleChange[] | { label: string; display: string; loosens: boolean }[] }) {
  return (
    <ul className="space-y-1.5">
      {changes.map((c) => (
        <li key={c.label} className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-bold">{c.label}:</span>
          <span className="figures">{c.display}</span>
          {c.loosens && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-wait">
              <TriangleAlert aria-hidden size={12} /> lets Tend pay more without asking
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function PlainEnglish({ initialAsk, aiLive, onPropose }: { initialAsk: string | null; aiLive: boolean; onPropose: (m: Mandate) => void }) {
  const [text, setText] = useState(initialAsk ?? "");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ ok: boolean; text: string } | null>(null);
  const ran = useRef(false);

  async function propose(t: string) {
    if (!t.trim()) return;
    setBusy(true);
    setReply(null);
    try {
      const r = await post("/api/rules/propose", { text: t });
      setReply({ ok: r.understood, text: r.understood ? `${r.reply} Review it below, then save.` : r.reply });
      if (r.understood) onPropose(r.next);
    } catch (e) {
      setReply({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialAsk && !ran.current) {
      ran.current = true;
      void propose(initialAsk);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAsk]);

  return (
    <section aria-labelledby="plain" className="surface-card rounded-3xl border border-rule bg-dial p-5 sm:p-7">
      <h2 id="plain" className="flex items-center gap-3 text-lg font-bold">
        <MessageCircle aria-hidden size={18} className="text-accent" />
        Change a rule in plain words
      </h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">
        {aiLive ? "The AI proposes the change. Nothing happens until you save it." : "Demo mode reads simple sentences without AI. Nothing happens until you save it."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void propose(text);
        }}
        className="mt-5 flex flex-col gap-3 sm:flex-row"
      >
        <label htmlFor="plain-text" className="sr-only">
          The change you want
        </label>
        <input id="plain-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Let pharmacy auto-pay up to $80" className={field} />
        <button disabled={busy || !text.trim()} className={btn.primary}>
          {busy ? "Reading…" : "Propose"}
        </button>
      </form>
      {reply && <p role="status" className={`mt-2 text-[0.9375rem] ${reply.ok ? "" : "font-bold text-stop"}`}>{reply.text}</p>}
    </section>
  );
}

function HistoryList({ history, memberId, current }: { history: History; memberId: string; current: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return (
    <section aria-labelledby="history">
      <h2 id="history" className="font-display text-2xl font-medium tracking-[-0.02em]">Every version of the rules</h2>
      <p className="mt-2 leading-relaxed text-ink-soft">Rules are never edited in place. Each change is a new version, and every payment records which version decided it.</p>
      {error && <p role="alert" className="mt-2 font-bold text-stop">{error}</p>}
      <ol className="mt-5 divide-y divide-rule overflow-hidden surface-card rounded-3xl border border-rule bg-dial">
        {history.map((h) => (
          <li key={h.version} className="px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold">
                Version {h.version}
                <span className="font-normal text-ink-soft">
                  {" "}by {h.by}, <span className="figures">{fmt.format(new Date(h.at))}</span>
                </span>
                {h.version === current && <span className="ml-2 text-xs font-bold text-paid">In use</span>}
              </p>
              {h.version !== current && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={async () => {
                    setBusy(h.version);
                    setError(null);
                    try {
                      await post("/api/rules/revert", { memberId, version: h.version });
                      router.refresh();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className={btn.quiet}
                >
                  <Undo2 aria-hidden size={14} />
                  {busy === h.version ? "Restoring…" : "Go back to this"}
                </button>
              )}
            </div>
            {h.changes.length > 0 ? (
              <div className="mt-2 text-[0.9375rem]">
                <ChangeList changes={h.changes} />
              </div>
            ) : (
              <p className="mt-1 text-[0.9375rem] text-ink-soft">The rules the circle started with.</p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function MoneyInput({ label, minor, onChange, optional, hint }: { label: string; minor: number | null; onChange: (v: number | null) => void; optional?: boolean; hint?: string }) {
  const [text, setText] = useState(minor === null ? "" : String(minor / 100));
  useEffect(() => setText(minor === null ? "" : String(minor / 100)), [minor]);
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <span className="relative mt-2 block">
        <span aria-hidden className="figures absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-soft">$</span>
        <input
          inputMode="decimal"
          value={text}
          placeholder={optional ? "None" : "0"}
          onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
          onBlur={() => {
            if (text.trim() === "") return onChange(optional ? null : 0);
            const n = Number(text);
            if (Number.isFinite(n)) onChange(Math.round(n * 100));
          }}
          className={`${field} figures pl-7`}
        />
      </span>
      {hint && <span className="mt-1 block text-[0.9375rem] leading-relaxed text-ink-soft">{hint}</span>}
    </label>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="text-sm font-bold">{label}</p>
      <div className="mt-2 inline-flex items-center rounded-xl border-2 border-rule">
        <button type="button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} className="grid min-h-12 min-w-12 place-items-center text-xl font-bold disabled:opacity-40" aria-label="One fewer person">
          −
        </button>
        <span className="figures min-w-24 text-center text-lg" aria-live="polite">
          {value} {value === 1 ? "person" : "people"}
        </span>
        <button type="button" onClick={() => onChange(Math.min(3, value + 1))} disabled={value >= 3} className="grid min-h-12 min-w-12 place-items-center text-xl font-bold disabled:opacity-40" aria-label="One more person">
          +
        </button>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled, onLabel = "On", offLabel = "Off" }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; onLabel?: string; offLabel?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <span className={`text-sm font-bold ${checked ? "text-ink" : "text-ink-soft"}`}>{checked ? onLabel : offLabel}</span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="relative h-7 w-12 cursor-pointer appearance-none rounded-full bg-rule-strong transition-colors duration-200 before:absolute before:top-1 before:left-1 before:size-5 before:rounded-full before:bg-white before:shadow before:transition-transform before:duration-200 checked:bg-action checked:before:translate-x-5 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </span>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-bold">{label}</span>
        <span className="figures text-lg">{Math.round(value * 100)}%</span>
      </span>
      <input type="range" min={5} max={100} step={5} value={Math.round(value * 100)} onChange={(e) => onChange(Number(e.target.value) / 100)} className="mt-3 min-h-8 w-full accent-[var(--color-action)]" />
    </label>
  );
}
