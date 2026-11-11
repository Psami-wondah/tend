"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Plus, Trash2 } from "lucide-react";
import { btn, field } from "./ui";

type Person = { name: string; city: string; timezone: string };
type Helper = Person & { relation: string };
type Rules = { coolingOffHours: 12 | 24 | 48 | 71; coolOffOver: number; approvalOver: number; holdNewPayees: boolean };
type Invite = { id: string; name: string; role: string; relation: string | null; url: string };

const ZONES: [string, string][] = [
  ["Pacific/Honolulu", "Hawaii"],
  ["America/Anchorage", "Alaska"],
  ["America/Los_Angeles", "Pacific (Los Angeles, Seattle)"],
  ["America/Phoenix", "Arizona (Phoenix, Tucson)"],
  ["America/Denver", "Mountain (Denver)"],
  ["America/Chicago", "Central (Chicago, Houston)"],
  ["America/New_York", "Eastern (New York, Miami)"],
  ["America/Toronto", "Toronto"],
  ["Europe/London", "UK (London)"],
  ["Europe/Paris", "Central Europe (Paris, Berlin)"],
  ["Africa/Lagos", "West Africa (Lagos)"],
  ["Africa/Nairobi", "East Africa (Nairobi)"],
  ["Africa/Johannesburg", "South Africa"],
  ["Asia/Kolkata", "India"],
  ["Asia/Manila", "Philippines"],
  ["Australia/Sydney", "Sydney"],
];

const RELATIONS = ["Daughter", "Son", "Niece", "Nephew", "Grandchild", "Sister", "Brother", "Friend", "Neighbour", "Carer"];
const STEPS = ["Who it's for", "Their second key", "How careful", "Check it over"];

function ZoneSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const known = ZONES.some(([z]) => z === value);
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      {!known && <option value={value}>{value.replace(/_/g, " ")}</option>}
      {ZONES.map(([z, label]) => (
        <option key={z} value={z}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-[0.9375rem] font-bold">
        {label}
      </label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * Setting Tend up for someone, in four short steps. It ends with a real
 * circle and a personal link for everyone in it.
 */
export function StartWizard() {
  const [step, setStep] = useState(0);
  const [tz, setTz] = useState("America/New_York");
  const [person, setPerson] = useState<Person>({ name: "", city: "", timezone: "America/New_York" });
  const [helpers, setHelpers] = useState<Helper[]>([{ name: "", relation: "Daughter", city: "", timezone: "America/New_York" }]);
  const [rules, setRules] = useState<Rules>({ coolingOffHours: 24, coolOffOver: 150, approvalOver: 1000, holdNewPayees: true });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<Invite[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!mine) return;
    setTz(mine);
    setPerson((p) => ({ ...p, timezone: mine }));
    setHelpers((hs) => hs.map((h) => ({ ...h, timezone: mine })));
  }, []);

  const them = person.name.trim() || "them";
  const theirs = person.name.trim() ? `${person.name.trim()}'s` : "their";

  function check(): string | null {
    if (step === 0 && (!person.name.trim() || !person.city.trim())) return "Add their name and where they live.";
    if (step === 1 && helpers.some((h) => !h.name.trim() || !h.city.trim())) return "Add a name and a city for everyone, or remove the empty row.";
    return null;
  }

  function next() {
    const problem = check();
    setError(problem);
    if (!problem) setStep((s) => s + 1);
  }

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/circles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ person, helpers, rules }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Couldn't set that up. Try again.");
    setLinks(json.links);
  }

  async function copy(l: Invite) {
    try {
      await navigator.clipboard.writeText(l.url);
      setCopied(l.id);
    } catch {
      setCopied(null);
    }
  }

  const setHelper = (n: number, patch: Partial<Helper>) => setHelpers((hs) => hs.map((h, i) => (i === n ? { ...h, ...patch } : h)));

  if (links) {
    const [centre, ...rest] = links;
    return (
      <div className="rise">
        <span className="grid size-16 place-items-center rounded-2xl border border-paid/20 bg-paid-tint text-paid">
          <Check aria-hidden size={30} strokeWidth={2.5} />
        </span>
        <h1 className="mt-5 font-display text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.025em] sm:text-[2.75rem] text-balance">{centre.name}&apos;s circle is ready</h1>
        <p className="mt-3 text-lg text-ink-soft">
          Send everyone their own link. {centre.name}&apos;s opens their screen, with three big buttons; the others open the circle&apos;s home, where alerts can be turned on.
        </p>
        <ul className="mt-7 divide-y divide-rule overflow-hidden rounded-3xl border border-rule bg-dial">
          {[centre, ...rest].map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">
                  {l.name}
                  <span className="font-normal text-ink-soft">{l.role === "care_recipient" ? ", the person at the centre" : l.relation ? `, ${l.relation}` : ""}</span>
                </span>
                <span className="block truncate text-sm text-ink-soft">{l.url}</span>
              </span>
              <button type="button" onClick={() => copy(l)} className={btn.secondary}>
                {copied === l.id ? <Check aria-hidden size={18} /> : <Copy aria-hidden size={18} />}
                {copied === l.id ? "Copied" : "Copy link"}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[0.9375rem] text-ink-soft">
          The first time {centre.name} pays someone, they approve it in their own PayPal. Tend never sees their password, and their money never moves into anyone else&apos;s hands.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/home" className={btn.primary}>
            Open the circle&apos;s home
          </Link>
          <a href={centre.url} className={btn.secondary}>
            See {centre.name}&apos;s screen
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <ol className="grid grid-cols-4 gap-2 border-b border-rule pb-6 sm:gap-4" aria-label="Steps">
        {STEPS.map((s, n) => (
          <li key={s} aria-current={n === step ? "step" : undefined} className="min-w-0">
            <span aria-hidden className={`figures mb-3 grid size-9 place-items-center rounded-full border text-base font-semibold ${n < step ? "border-paid/25 bg-paid-tint text-paid" : n === step ? "border-action bg-action text-action-ink" : "border-rule-strong bg-dial text-ink-soft"}`}>{n < step ? <Check size={17} strokeWidth={2.5} /> : n + 1}</span>
            <span aria-hidden className={`block h-1 rounded-full ${n < step ? "bg-paid" : n === step ? "bg-action" : "bg-rule"}`} />
            <span className={`mt-2 block text-sm leading-snug font-bold ${n === step ? "text-ink" : "text-ink-soft"}`}>{s}</span>
          </li>
        ))}
      </ol>

      <form
        className="mt-8 sm:mt-10"
        onSubmit={(e) => {
          e.preventDefault();
          if (step < 3) next();
          else void create();
        }}
      >
        {step === 0 && (
          <section className="rise">
            <h1 className="font-display text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.025em] sm:text-[2.75rem]">Who is Tend for?</h1>
            <p className="mt-3 text-lg text-ink-soft">They keep paying from their own PayPal. Tend gives the people they trust time to look at anything unusual first.</p>
            <div className="mt-7 grid gap-6 rounded-3xl border border-rule bg-dial p-5 sm:p-7">
              <Field label="Their first name" id="p-name">
                <input id="p-name" className={field} value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} placeholder="Walter" autoComplete="off" autoFocus />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Where they live" id="p-city">
                  <input id="p-city" className={field} value={person.city} onChange={(e) => setPerson({ ...person, city: e.target.value })} placeholder="Tucson" autoComplete="off" />
                </Field>
                <Field label="Their time zone" id="p-tz">
                  <ZoneSelect id="p-tz" value={person.timezone} onChange={(v) => setPerson({ ...person, timezone: v })} />
                </Field>
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="rise">
            <h1 className="font-display text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.025em] sm:text-[2.75rem]">Who&apos;s {theirs} second key?</h1>
            <p className="mt-3 text-lg text-ink-soft">
              One to four people {them} trusts: family, a friend, a neighbour. When something is held, whoever is awake gets the alert. Start with yourself.
            </p>
            <ul className="mt-7 space-y-4">
              {helpers.map((h, n) => (
                <li key={n} className="grid gap-5 rounded-3xl border border-rule bg-dial p-5 sm:p-7">
                  <div className="flex items-center justify-between gap-3 border-b border-rule pb-4">
                    <span className="font-display text-xl font-semibold">{n === 0 ? "You" : `Person ${n + 1}`}</span>
                    {n > 0 && (
                      <button type="button" onClick={() => setHelpers(helpers.filter((_, i) => i !== n))} className="inline-flex min-h-12 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-ink-soft hover:bg-stop-tint hover:text-stop">
                        <Trash2 aria-hidden size={16} /> Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={n === 0 ? "Your first name" : "Their first name"} id={`h-name-${n}`}>
                      <input id={`h-name-${n}`} className={field} value={h.name} onChange={(e) => setHelper(n, { name: e.target.value })} placeholder={n === 0 ? "Priya" : "Dolores"} autoComplete="off" />
                    </Field>
                    <Field label={`How they know ${them}`} id={`h-rel-${n}`}>
                      <select id={`h-rel-${n}`} className={field} value={h.relation} onChange={(e) => setHelper(n, { relation: e.target.value })}>
                        {RELATIONS.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Where they live" id={`h-city-${n}`}>
                      <input id={`h-city-${n}`} className={field} value={h.city} onChange={(e) => setHelper(n, { city: e.target.value })} placeholder={n === 0 ? "Seattle" : "Tucson"} autoComplete="off" />
                    </Field>
                    <Field label="Their time zone" id={`h-tz-${n}`}>
                      <ZoneSelect id={`h-tz-${n}`} value={h.timezone} onChange={(v) => setHelper(n, { timezone: v })} />
                    </Field>
                  </div>
                </li>
              ))}
            </ul>
            {helpers.length < 4 && (
              <button
                type="button"
                onClick={() => setHelpers([...helpers, { name: "", relation: "Neighbour", city: person.city, timezone: person.timezone || tz }])}
                className={`${btn.secondary} mt-3 w-full`}
              >
                <Plus aria-hidden size={18} /> Add someone
              </button>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="rise">
            <h1 className="font-display text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.025em] sm:text-[2.75rem]">How careful should Tend be?</h1>
            <p className="mt-3 text-lg text-ink-soft">Ordinary bills to people {them} has paid before go straight through. These decide what waits.</p>
            <div className="mt-7 divide-y divide-rule overflow-hidden rounded-3xl border border-rule bg-dial">
              <div className="px-5 py-5 sm:px-7 sm:py-6">
                <p className="text-[0.9375rem] font-bold">Hold unusual payments for</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="How long to hold">
                  {([12, 24, 48, 71] as const).map((h) => (
                    <button
                      key={h}
                      type="button"
                      role="radio"
                      aria-checked={rules.coolingOffHours === h}
                      onClick={() => setRules({ ...rules, coolingOffHours: h })}
                      className={`figures min-h-14 rounded-2xl border-2 text-base font-medium transition-colors duration-200 ${rules.coolingOffHours === h ? "border-action bg-action text-action-ink" : "border-rule bg-dial hover:border-ink"}`}
                    >
                      {h === 71 ? "3 days" : `${h} hours`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-7 sm:py-6">
                {(
                  [
                    ["coolOffOver", "Hold any payment over"],
                    ["approvalOver", "Wait for someone's yes over"],
                  ] as const
                ).map(([k, label]) => (
                  <Field key={k} label={label} id={k}>
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-soft">$</span>
                      <input
                        id={k}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        className={`${field} figures pl-7`}
                        value={rules[k]}
                        onChange={(e) => setRules({ ...rules, [k]: Math.max(0, Number(e.target.value) || 0) })}
                      />
                    </div>
                  </Field>
                ))}
              </div>
              <label className="flex min-h-20 items-center justify-between gap-4 px-5 py-5 sm:px-7">
                <span>
                  <span className="block font-bold">Hold their first payment to anyone new</span>
                  <span className="block text-sm text-ink-soft">The roofer at the door, a new website, a stranger&apos;s PayPal.</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={rules.holdNewPayees}
                  onChange={(e) => setRules({ ...rules, holdNewPayees: e.target.checked })}
                  className="relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-rule-strong transition-colors duration-200 before:absolute before:top-1 before:left-1 before:size-5 before:rounded-full before:bg-white before:shadow before:transition-transform before:duration-200 checked:bg-action checked:before:translate-x-5"
                />
              </label>
            </div>
            <p className="mt-3 text-[0.9375rem] text-ink-soft">
              Gift cards, crypto and wire transfers are always refused, and so is anyone posing as family, a bank or a government office. You can change any of this later.
            </p>
          </section>
        )}

        {step === 3 && (
          <section className="rise">
            <h1 className="font-display text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.025em] sm:text-[2.75rem]">Check it over</h1>
            <dl className="mt-7 divide-y divide-rule overflow-hidden rounded-3xl border border-rule bg-dial">
              <div className="px-5 py-5 sm:px-7">
                <dt className="text-sm font-bold text-ink-soft">Tend is for</dt>
                <dd className="mt-1.5 text-lg font-bold">
                  {person.name}, in {person.city}
                </dd>
              </div>
              <div className="px-5 py-5 sm:px-7">
                <dt className="text-sm font-bold text-ink-soft">Their second key</dt>
                <dd className="mt-1.5 text-lg font-bold">{helpers.map((h) => `${h.name} (${h.relation.toLowerCase()}, ${h.city})`).join(", ")}</dd>
              </div>
              <div className="px-5 py-5 sm:px-7">
                <dt className="text-sm font-bold text-ink-soft">What waits</dt>
                <dd className="mt-1.5 leading-relaxed">
                  Anything over <span className="figures">${rules.coolOffOver.toLocaleString("en-US")}</span>
                  {rules.holdNewPayees ? " or to someone new" : ""} is held for {rules.coolingOffHours === 71 ? "3 days" : `${rules.coolingOffHours} hours`}. Over{" "}
                  <span className="figures">${Math.max(rules.approvalOver, rules.coolOffOver).toLocaleString("en-US")}</span>, or with warning signs, it waits for a yes.
                </dd>
              </div>
              <div className="px-5 py-5 sm:px-7">
                <dt className="text-sm font-bold text-ink-soft">Their PayPal</dt>
                <dd className="mt-1.5 leading-relaxed">
                  {person.name} approves each payment in their own PayPal. Tend asks PayPal to authorize it, and only captures it once it&apos;s cleared.
                </dd>
              </div>
            </dl>
          </section>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-stop-tint px-4 py-3 font-bold text-stop">
            {error}
          </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-rule pt-6">
          {step > 0 && (
            <button type="button" onClick={() => setStep(step - 1)} className={btn.secondary}>
              <ArrowLeft aria-hidden size={18} /> Back
            </button>
          )}
          <button type="submit" disabled={busy} className={`${btn.primary} ml-auto min-w-40 flex-1 sm:flex-none`}>
            {step < 3 ? "Next" : busy ? "Setting up…" : `Set up ${theirs} circle`}
          </button>
        </div>
      </form>
    </div>
  );
}
