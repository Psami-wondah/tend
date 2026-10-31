"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type ICellRendererParams,
  type IRowNode,
  type RowClickedEvent,
} from "ag-grid-community";
import { Download, MessageCircle, Search, X } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { personVar } from "@/lib/people";
import { categoryLabel } from "@/lib/mandate/edit";
import { rowMatches, type PassbookQuery } from "@/lib/passbook-filter";
import type { PassbookRow } from "@/lib/views";
import { btn, field } from "./ui";
import { Txt } from "./figures-text";

ModuleRegistry.registerModules([AllCommunityModule]);

type Person = { name: string; color: string | null; role: string };

// The grid wears the clock wall: enamel, dial white, night headers, person colours in cells.
const tendTheme = themeQuartz.withParams({
  fontFamily: "var(--font-atkinson), system-ui, sans-serif",
  headerFontFamily: "var(--font-atkinson), system-ui, sans-serif",
  fontSize: 15,
  headerFontSize: 14,
  headerFontWeight: 700,
  backgroundColor: "var(--color-dial)",
  foregroundColor: "var(--color-ink)",
  textColor: "var(--color-ink)",
  headerBackgroundColor: "var(--color-enamel)",
  headerTextColor: "var(--color-ink-soft)",
  borderColor: "var(--color-rule)",
  rowHoverColor: "color-mix(in srgb, var(--color-accent) 7%, transparent)",
  selectedRowBackgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
  accentColor: "var(--color-accent)",
  pinnedRowBackgroundColor: "var(--color-enamel)",
  pinnedRowFontWeight: 700,
  wrapperBorderRadius: 16,
  wrapperBorder: false,
  rowHeight: 52,
  headerHeight: 44,
  spacing: 7,
  browserColorScheme: "inherit",
});

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

const SUGGESTIONS = ["What was stopped or refused?", "Pharmacy payments this month", "Anything over $100", "Refunds and money back", "Anything held right now"];

function emptyQuery(): PassbookQuery {
  return { people: [], categories: [], types: [], statuses: null, payee: null, minAmount: null, maxAmount: null, from: null, to: null, sort: null, summary: "" };
}

export function PassbookGrid({ rows, currency, people, aiLive, pot = true }: { rows: PassbookRow[]; currency: string; people: Person[]; aiLive: boolean; pot?: boolean }) {
  const router = useRouter();
  const api = useRef<GridApi<PassbookRow> | null>(null);
  const [quick, setQuick] = useState("");
  const [question, setQuestion] = useState("");
  const [query, setQuery] = useState<PassbookQuery>(emptyQuery);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [viaAi, setViaAi] = useState<boolean | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [totals, setTotals] = useState({ in: 0, out: 0, kept: 0, count: rows.length });
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const money = useCallback((m: number) => (m ? formatMoney(m, currency) : ""), [currency]);
  const colourFor = useCallback((name: string) => people.find((p) => p.name === name), [people]);

  const columns = useMemo<ColDef<PassbookRow>[]>(
    () => [
      {
        field: "at",
        headerName: "Date",
        width: narrow ? 82 : 112,
        minWidth: 82,
        suppressHeaderFilterButton: narrow,
        sort: "desc",
        valueFormatter: (p) => (p.value ? dateFmt.format(new Date(p.value)) : ""),
        filter: "agDateColumnFilter",
        filterParams: {
          comparator: (filter: Date, cell: string) => {
            const d = new Date(cell);
            const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            return day === filter.getTime() ? 0 : day < filter.getTime() ? -1 : 1;
          },
        },
        cellClass: "figures text-ink-soft",
      },
      {
        field: "description",
        headerName: "Details",
        flex: 2,
        minWidth: narrow ? 120 : 240,
        filter: "agTextColumnFilter",
        suppressHeaderFilterButton: narrow,
        tooltipField: narrow ? undefined : "description",
        wrapText: narrow,
        autoHeight: narrow,
        cellClass: narrow ? "leading-snug py-2.5" : undefined,
        cellRenderer: (p: ICellRendererParams<PassbookRow>) =>
          p.data?.intentId ? (
            <>
              <Link href={`/payments/${p.data.intentId}`} className="font-bold hover:underline" onClick={(e) => e.stopPropagation()}>
                {p.value}
              </Link>
              {/* The Status column is hidden on phones, so say it here. */}
              {narrow && STATUS_NOTE[p.data.status ?? ""] && <span className="ml-1.5 text-sm font-bold text-ink-soft">{STATUS_NOTE[p.data.status ?? ""]}</span>}
            </>
          ) : (
            <span className={p.node.rowPinned ? "" : "font-bold"}>
              <Txt>{String(p.value ?? "")}</Txt>
            </span>
          ),
      },
      {
        field: "who",
        headerName: "Who",
        width: 170,
        // Without a pot there's one payer, so the column would say the same name on every row.
        hide: narrow || !pot,
        filter: "agTextColumnFilter",
        cellRenderer: (p: ICellRendererParams<PassbookRow>) => {
          if (!p.value) return null;
          return (
            <span className="flex flex-wrap items-center gap-x-2.5">
              {String(p.value)
                .split(", ")
                .map((n) => {
                  const m = colourFor(n);
                  return (
                    <span key={n} className="inline-flex items-center gap-1.5">
                      {m && <span aria-hidden className="size-2.5 rounded-full" style={{ background: personVar(m) }} />}
                      {n}
                    </span>
                  );
                })}
            </span>
          );
        },
      },
      {
        field: "category",
        headerName: "Category",
        width: 130,
        hide: narrow,
        filter: "agTextColumnFilter",
        valueFormatter: (p) => (p.value === "top-up" ? "Top-up" : p.value === "refund" ? "Refund" : p.value === "verification" ? "Payee check" : categoryLabel(p.value ?? "")),
      },
      {
        field: "status",
        headerName: "Status",
        width: 112,
        hide: narrow,
        filter: "agTextColumnFilter",
        cellRenderer: (p: ICellRendererParams<PassbookRow>) => {
          const v = String(p.value ?? "");
          if (!v || p.node.rowPinned) return null;
          const tone = v === "stopped" || v === "refused" ? "bg-stop-tint text-stop" : v === "held" ? "bg-wait-tint text-wait" : v === "in" || v === "refunded" ? "bg-paid-tint text-paid" : "bg-enamel text-ink-soft";
          return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{v}</span>;
        },
      },
      {
        colId: "amount",
        headerName: "Amount",
        width: 104,
        hide: !narrow,
        type: "rightAligned",
        valueGetter: (p) => (p.data ? p.data.inMinor - p.data.outMinor : 0),
        valueFormatter: (p) => (p.value > 0 ? `+${money(p.value)}` : p.value < 0 ? `−${money(-p.value)}` : ""),
        cellClass: (p) => `figures font-medium ${p.value > 0 ? "text-paid" : ""} ${p.data?.status === "stopped" || p.data?.status === "refused" ? "line-through text-ink-soft" : ""}`,
      },
      {
        field: "inMinor",
        headerName: "In",
        width: 112,
        hide: narrow || !pot,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        filterValueGetter: (p) => (p.data?.inMinor ?? 0) / 100,
        valueFormatter: (p) => (p.value ? `+${money(p.value)}` : ""),
        cellClass: "figures text-paid font-medium",
      },
      {
        field: "outMinor",
        headerName: "Out",
        width: 112,
        hide: narrow,
        type: "rightAligned",
        filter: "agNumberColumnFilter",
        filterValueGetter: (p) => (p.data?.outMinor ?? 0) / 100,
        valueFormatter: (p) => (p.value ? `−${money(p.value)}` : ""),
        cellClass: (p) => `figures font-medium ${p.data?.status === "stopped" || p.data?.status === "refused" ? "line-through text-ink-soft" : ""}`,
      },
      {
        field: "balanceMinor",
        headerName: "Balance",
        width: 118,
        hide: narrow || !pot,
        type: "rightAligned",
        sortable: false,
        valueFormatter: (p) => (p.node?.rowPinned || p.value === null || p.value === undefined ? "" : formatMoney(p.value, currency)),
        cellClass: "figures text-ink-soft",
      },
      {
        field: "paypalId",
        headerName: "PayPal",
        width: 170,
        hide: true,
        cellRenderer: (p: ICellRendererParams<PassbookRow>) => {
          const v = p.value as string | null;
          if (!v) return null;
          const tag = v.startsWith("SIM-") ? "Simulated" : v.startsWith("SEED-") ? "Seed data" : null;
          return (
            <span className="figures text-sm text-ink-soft">
              {tag ?? v}
            </span>
          );
        },
      },
    ],
    [narrow, pot, money, currency, colourFor],
  );

  const recomputeTotals = useCallback(() => {
    const g = api.current;
    if (!g) return;
    let inM = 0;
    let outM = 0;
    let kept = 0;
    let count = 0;
    g.forEachNodeAfterFilter((n: IRowNode<PassbookRow>) => {
      if (!n.data) return;
      count++;
      // Held, stopped and refused payments are listed, but that money never left.
      if (n.data.status === "held" || n.data.status === "stopped" || n.data.status === "refused") {
        kept += n.data.outMinor;
        return;
      }
      inM += n.data.inMinor;
      outM += n.data.outMinor;
    });
    // Bail out when nothing changed: a new object here re-renders the grid, which fires this again.
    setTotals((t) => (t.in === inM && t.out === outM && t.kept === kept && t.count === count ? t : { in: inM, out: outM, kept, count }));
  }, []);

  const defaultColDef = useMemo<ColDef<PassbookRow>>(() => ({ sortable: true, resizable: true, suppressHeaderMenuButton: false, filter: false }), []);
  const getRowId = useCallback((p: { data: PassbookRow }) => p.data.id, []);
  const isExternalFilterPresent = useCallback(() => hasQuery(queryRef.current), []);
  const doesExternalFilterPass = useCallback((node: IRowNode<PassbookRow>) => (node.data ? rowMatches(node.data, queryRef.current) : true), []);
  const onGridReady = useCallback(
    (e: GridReadyEvent<PassbookRow>) => {
      api.current = e.api;
      recomputeTotals();
    },
    [recomputeTotals],
  );
  const onRowClicked = useCallback(
    (e: RowClickedEvent<PassbookRow>) => {
      if (e.data?.intentId && !e.node.rowPinned) router.push(`/payments/${e.data.intentId}`);
    },
    [router],
  );

  const pinned = useMemo<PassbookRow[]>(
    () => [
      {
        id: "total",
        at: "",
        type: "payment",
        status: "",
        description: `${totals.count} ${totals.count === 1 ? "entry" : "entries"}, net ${formatMoney(totals.in - totals.out, currency)}${totals.kept ? `; ${formatMoney(totals.kept, currency)} held back or kept` : ""}`,
        who: "",
        payee: null,
        category: "",
        reference: null,
        inMinor: totals.in,
        outMinor: totals.out,
        balanceMinor: 0,
        intentId: null,
        paypalId: null,
      },
    ],
    [totals, currency],
  );

  // AI or keyword-parsed filter, applied through the grid's external filter.
  useEffect(() => {
    const g = api.current;
    if (!g) return;
    g.onFilterChanged();
    if (query.sort) {
      const state =
        query.sort === "newest" ? [{ colId: "at", sort: "desc" as const }]
        : query.sort === "oldest" ? [{ colId: "at", sort: "asc" as const }]
        : query.sort === "largest" ? [{ colId: narrow ? "amount" : "outMinor", sort: "desc" as const }]
        : [{ colId: narrow ? "amount" : "outMinor", sort: "asc" as const }];
      g.applyColumnState({ state, defaultState: { sort: null } });
    }
  }, [query, narrow]);

  async function ask(q: string) {
    if (!q.trim()) return;
    setQuestion(q);
    setAsking(true);
    setAskError(null);
    try {
      const res = await fetch("/api/passbook/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't read that question.");
      const { viaAi: ai, ...rest } = json;
      setViaAi(ai);
      setQuery(rest);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e));
    } finally {
      setAsking(false);
    }
  }

  const chips = chipsFor(query, currency);
  const removeChip = (key: keyof PassbookQuery, value?: string) =>
    setQuery((q) => {
      const next = { ...q };
      if (Array.isArray(next[key]) && value !== undefined) (next[key] as string[]) = (next[key] as string[]).filter((x) => x !== value);
      else (next[key] as unknown) = null;
      return next;
    });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="rounded-2xl bg-dial p-4"
      >
        <label htmlFor="ask-passbook" className="flex items-center gap-2 font-bold">
          <MessageCircle aria-hidden size={18} className="text-accent" />
          Ask the passbook
        </label>
        <p className="mt-0.5 text-sm text-ink-soft">{aiLive ? "Claude turns your question into a filter you can see and remove." : "Demo mode matches keywords; with an Anthropic or OpenRouter key, Claude reads the question."}</p>
        <div className="mt-2 flex gap-2">
          <input
            id="ask-passbook"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pharmacy payments over $20 since October"
            className={field}
          />
          <button disabled={asking || !question.trim()} className={btn.primary}>
            {asking ? "Reading…" : "Ask"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => void ask(s)} className="min-h-9 rounded-full border border-rule px-3 text-sm hover:border-ink">
              {s}
            </button>
          ))}
        </div>
        {askError && <p role="alert" className="mt-2 font-bold text-stop">{askError}</p>}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {chips.length > 0 && (
          <>
            <span className="text-sm text-ink-soft">{viaAi ? "Claude filtered to:" : "Showing:"}</span>
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => removeChip(c.key, c.value)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-action px-3 text-sm font-bold text-action-ink"
                aria-label={`Remove filter: ${c.label}`}
              >
                {c.label}
                <X aria-hidden size={14} strokeWidth={3} />
              </button>
            ))}
            <button type="button" onClick={() => setQuery(emptyQuery())} className={btn.quiet}>
              Clear
            </button>
          </>
        )}
        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-56">
            <span className="sr-only">Search the passbook</span>
            <Search aria-hidden size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" />
            <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Search" className={`${field} min-h-10 pl-9`} />
          </label>
          <button
            type="button"
            onClick={() => api.current?.exportDataAsCsv({ fileName: "tend-passbook.csv", columnKeys: ["at", "description", "who", "category", "inMinor", "outMinor", "balanceMinor", "paypalId"] })}
            className={`${btn.secondary} min-h-10 px-3 text-sm`}
          >
            <Download aria-hidden size={16} /> CSV
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgb(18_21_28/0.05)]">
        <AgGridReact<PassbookRow>
          theme={tendTheme}
          rowData={rows}
          columnDefs={columns}
          defaultColDef={defaultColDef}
          getRowId={getRowId}
          domLayout="autoHeight"
          quickFilterText={quick}
          isExternalFilterPresent={isExternalFilterPresent}
          doesExternalFilterPass={doesExternalFilterPass}
          pinnedBottomRowData={pinned}
          onGridReady={onGridReady}
          onFilterChanged={recomputeTotals}
          onRowDataUpdated={recomputeTotals}
          onRowClicked={onRowClicked}
          rowClass="cursor-pointer"
          overlayNoRowsTemplate="<span style='padding:24px'>Nothing matches. Clear the filter to see everything.</span>"
          animateRows
        />
      </div>
    </div>
  );
}

const STATUS_NOTE: Record<string, string> = { held: "· held", stopped: "· stopped", refused: "· refused" };

function hasQuery(q: PassbookQuery) {
  return Boolean(q.people.length || q.categories.length || q.types.length || q.statuses?.length || q.payee || q.minAmount !== null || q.maxAmount !== null || q.from || q.to);
}

function chipsFor(q: PassbookQuery, currency: string): { key: keyof PassbookQuery; value?: string; label: string }[] {
  const out: { key: keyof PassbookQuery; value?: string; label: string }[] = [];
  const m = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  const d = (s: string) => dateFmt.format(new Date(`${s}T12:00:00Z`));
  for (const p of q.people) out.push({ key: "people", value: p, label: p });
  for (const c of q.categories) out.push({ key: "categories", value: c, label: c === "top-up" ? "Top-ups" : categoryLabel(c) });
  const typeLabel: Record<string, string> = { contribution: "Money in", payment: "From the pot", refund: "Refunds", verification: "Payee checks", own: "Own PayPal" };
  for (const t of q.types) out.push({ key: "types", value: t, label: typeLabel[t] ?? t });
  for (const st of q.statuses ?? []) out.push({ key: "statuses", value: st, label: st.charAt(0).toUpperCase() + st.slice(1) });
  if (q.payee) out.push({ key: "payee", label: `Payee: ${q.payee}` });
  if (q.minAmount !== null) out.push({ key: "minAmount", label: `Over ${m(q.minAmount)}` });
  if (q.maxAmount !== null) out.push({ key: "maxAmount", label: `Under ${m(q.maxAmount)}` });
  if (q.from) out.push({ key: "from", label: `From ${d(q.from)}` });
  if (q.to) out.push({ key: "to", label: `To ${d(q.to)}` });
  return out;
}
