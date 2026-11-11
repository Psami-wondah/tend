"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BadgeCheck, CircleAlert, Plus, Send } from "lucide-react";
import { CATEGORIES } from "@/lib/mandate/types";
import { categoryLabel } from "@/lib/mandate/edit";
import { formatMoney } from "@/lib/money";
import { btn, field } from "./ui";

/** "gr•••ce@example.com": enough to recognise the account, not enough to copy it off a screen. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain || local.length <= 4) return email;
  return `${local.slice(0, 2)}•••${local.slice(-2)}@${domain}`;
}

type Row = {
  id: string;
  name: string;
  kind: string;
  paypalEmail: string;
  aliases: string[];
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: string | null;
  verificationSent: boolean;
  addedBy: string | null;
  paidMinor: number;
  paidCount: number;
  lastPaidAt: string | null;
};

async function post(url: string, data: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function PayeesList({ rows, memberId, currency, simulated }: { rows: Row[]; memberId: string; currency: string; simulated: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-6">
      <ul className="space-y-4">
        {rows.map((r) => (
          <PayeeItem key={r.id} r={r} memberId={memberId} currency={currency} simulated={simulated} />
        ))}
      </ul>
      {adding ? (
        <AddPayee memberId={memberId} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${btn.secondary} w-full`}>
          <Plus aria-hidden size={18} /> Add a payee
        </button>
      )}
    </div>
  );
}

function PayeeItem({ r, memberId, currency, simulated }: { r: Row; memberId: string; currency: string; simulated: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [sent, setSent] = useState(r.verificationSent);

  async function act(what: "verify" | "confirm" | "vouch") {
    setBusy(what);
    setNote(null);
    try {
      if (what === "verify") {
        const j = await post(`/api/payees/${r.id}/verify`, { memberId });
        setSent(true);
        setNote({
          ok: true,
          text: j.simulated
            ? `Sent one cent (simulated). In demo mode the code is ${j.code}; in real life ${r.name} reads it from their PayPal note.`
            : `Sent one cent by PayPal to ${maskEmail(r.paypalEmail)}. Ask ${r.name} for the four-digit code in the note.`,
        });
      } else if (what === "confirm") {
        await post(`/api/payees/${r.id}/confirm`, { memberId, code });
        setNote({ ok: true, text: `${r.name} is verified.` });
      } else {
        await post(`/api/payees/${r.id}/vouch`, { memberId });
      }
      router.refresh();
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className={`rounded-3xl border bg-dial p-5 sm:p-6 ${r.verified ? "border-rule" : "border-2 border-wait/40"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold">{r.name}</h3>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-soft">
            {categoryLabel(r.kind)}, PayPal <span className="break-all">{maskEmail(r.paypalEmail)}</span>
          </p>
          {r.aliases.length > 0 && <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">Also appears on bills as {r.aliases.join(", ")}</p>}
        </div>
        {r.verified ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-paid-tint px-2.5 py-1 text-sm font-bold text-paid">
            <BadgeCheck aria-hidden size={16} /> Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-wait-tint px-2.5 py-1 text-sm font-bold text-wait">
            <CircleAlert aria-hidden size={16} /> Not verified
          </span>
        )}
      </div>
      <p className="mt-4 text-[0.9375rem]">
        {r.paidCount > 0 ? (
          <>
            Paid <span className="figures">{formatMoney(r.paidMinor, currency)}</span> over {r.paidCount} {r.paidCount === 1 ? "payment" : "payments"}
            {r.lastPaidAt ? `, last on ${dateFmt.format(new Date(r.lastPaidAt))}` : ""}.
          </>
        ) : (
          "Never paid yet."
        )}
        {r.verified && r.verifiedBy ? ` Verified by ${r.verifiedBy}.` : ""}
        {!r.verified && r.addedBy ? ` Added by ${r.addedBy}.` : ""}
      </p>

      {!r.verified && (
        <div className="mt-5 rounded-2xl border border-rule bg-enamel p-4 sm:p-5">
          <p className="text-[0.9375rem]">Tend never pays someone the circle hasn&apos;t verified. Send them one cent with a code, then type the code they saw.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <button type="button" onClick={() => act("verify")} disabled={busy !== null} className={btn.primary}>
              <Send aria-hidden size={17} />
              {busy === "verify" ? "Sending…" : sent ? "Send another cent" : `Send one cent${simulated ? " (simulated)" : ""}`}
            </button>
            {sent && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act("confirm");
                }}
                className="flex min-w-0 flex-wrap gap-2"
              >
                <label className="sr-only" htmlFor={`code-${r.id}`}>Code from the payout note</label>
                <input
                  id={`code-${r.id}`}
                  inputMode="numeric"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Code"
                  className={`${field} figures w-28 text-center text-lg tracking-[0.2em]`}
                />
                <button disabled={busy !== null || code.length !== 4} className={btn.approve}>
                  {busy === "confirm" ? "Checking…" : "Confirm"}
                </button>
              </form>
            )}
          </div>
          <button type="button" onClick={() => act("vouch")} disabled={busy !== null} className={`${btn.quiet} mt-2 px-0`}>
            I set this account up myself; mark it verified
          </button>
        </div>
      )}
      {note && <p role="status" className={`mt-2 text-[0.9375rem] font-bold ${note.ok ? "text-paid" : "text-stop"}`}>{note.text}</p>}
    </li>
  );
}

function AddPayee({ memberId, onDone }: { memberId: string; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState("pharmacy");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await post("/api/payees", { memberId, name, paypalEmail: email, kind });
          router.refresh();
          onDone();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-5 rounded-3xl border border-rule bg-dial p-5 sm:p-7"
    >
      <h3 className="text-lg font-bold">Add a payee</h3>
      <label className="block">
        <span className="text-sm font-bold">Name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} className={`${field} mt-2`} placeholder="Riverside Dental" />
      </label>
      <label className="block">
        <span className="text-sm font-bold">PayPal email</span>
        <input required type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${field} mt-2`} placeholder="Ask them directly, not from a bill" />
      </label>
      <label className="block">
        <span className="text-sm font-bold">What they are</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} mt-2`}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      </label>
      {error && <p role="alert" className="font-bold text-stop">{error}</p>}
      <div className="flex flex-wrap gap-3 border-t border-rule pt-5">
        <button disabled={busy} className={btn.primary}>{busy ? "Adding…" : "Add payee"}</button>
        <button type="button" onClick={onDone} className={btn.secondary}>Cancel</button>
      </div>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">New payees start unverified. You&apos;ll verify them with a one-cent check next.</p>
    </form>
  );
}
