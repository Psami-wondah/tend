"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import {
  AgStudioAiModule,
  createAiHarness,
  studioTheme,
  type AgAiEvent,
  type AgAiOutputItem,
  type AgDataSourcesDefinition,
  type AgLlmAdapter,
  type AgLlmResponse,
  type AgReportState,
  type AgStudioApi,
  type AgStudioMode,
} from "ag-studio";
import { PencilRuler, Eye, Save, RotateCcw } from "lucide-react";
import type { CircleReport } from "@/lib/report";

/**
 * The circle's dashboard, built with AG Studio (AG Grid's embedded analytics).
 *
 * It opens on a finished report: where the money went, what Tend kept in the
 * person's account, and who in the circle stepped in and when. Anyone in the
 * circle can switch to "Build your own" and drag fields onto the canvas, or
 * ask the assistant ("which week did we stop the most?") and watch it build
 * the widget. The assistant runs on Tend's own model through /api/studio/ai.
 */

type Tokens = Record<"enamel" | "ink" | "inkSoft" | "rule" | "accent" | "font", string> & { palette: string[] };

// Chart series wear the clock wall's person colours. None is green, so no series reads as "all clear".
const PALETTE = ["cobalt", "brass", "teal", "rust", "violet", "magenta"];

function readTokens(): Tokens {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    enamel: v("--color-enamel", "#f1f2f6"),
    ink: v("--color-ink", "#12151c"),
    inkSoft: v("--color-ink-soft", "#4a5163"),
    rule: v("--color-rule", "#d8dbe5"),
    accent: v("--color-accent", "#2f5bd3"),
    // The charts draw on a canvas, which can't read CSS variables, so pass the resolved font.
    font: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
    palette: PALETTE.map((c) => v(`--color-person-${c}`, "#2c5bd4")),
  };
}

const ref = (id: string, aggregation?: "sum" | "count" | "avg" | "max") => (aggregation ? { id, aggregation } : { id });
const title = (text: string) => ({ title: { enabled: true, text } });
// Stacked charts need their legend: the colours are the story.
const withLegend = (text: string) => ({
  ...title(text),
  style: {
    theme: { common: { legend: { enabled: true, position: "bottom" } } },
  },
});

const PAGES = [
  { id: "money", label: "Where the money went" },
  { id: "second-key", label: "The second key at work" },
  { id: "shares", label: "Shares paid in" },
];

/** The report the circle sees first. Every widget can be changed or deleted. */
function startingReport(pot: boolean, narrow = false): AgReportState {
  const money = {
    id: "money",
    widgets: {
      paid: {
        type: "value",
        dataMapping: { value: [ref("payments.paid", "sum")] },
        format: title("Paid"),
      },
      kept: {
        type: "value",
        dataMapping: { value: [ref("payments.kept", "sum")] },
        format: title("Kept safe"),
      },
      count: {
        type: "value",
        dataMapping: { value: [ref("payments.id", "count")] },
        format: title("Payments"),
      },
      steps: {
        type: "value",
        dataMapping: { value: [ref("actions.id", "count")] },
        format: title("Stepped in"),
      },
      weeks: {
        type: "column-chart-stacked",
        dataMapping: {
          categoryKey: [ref("payments.week")],
          valueKey: [ref("payments.amount", "sum")],
          legendKey: [ref("payments.outcome")],
        },
        format: withLegend("Each week: what happened to the money"),
      },
      categories: {
        type: "donut-chart",
        dataMapping: {
          categoryKey: [ref("payments.category")],
          valueKey: [ref("payments.paid", "sum")],
        },
        format: title("Paid, by category"),
      },
      list: {
        type: "grid",
        dataMapping: {
          cols: ["date", "payee", "category", "amount", "outcome", "decision", "money"].map((f) => ref(`payments.${f}`)),
        },
        sort: [{ field: ref("payments.date"), direction: "desc" }],
        format: title("Every payment"),
      },
    },
    widgetLayout: {
      paid: { xTrack: 0, yTrack: 0, xSpan: 6, ySpan: 5 },
      kept: { xTrack: 6, yTrack: 0, xSpan: 6, ySpan: 5 },
      count: { xTrack: 12, yTrack: 0, xSpan: 6, ySpan: 5 },
      steps: { xTrack: 18, yTrack: 0, xSpan: 6, ySpan: 5 },
      weeks: { xTrack: 0, yTrack: 5, xSpan: 15, ySpan: 13 },
      categories: { xTrack: 15, yTrack: 5, xSpan: 9, ySpan: 13 },
      list: { xTrack: 0, yTrack: 18, xSpan: 24, ySpan: 14 },
    },
    filter: {
      page: [ref("payments.outcome"), ref("payments.category"), ref("payments.money")].map((field) => ({ field })),
    },
  };

  const watch = {
    id: "second-key",
    widgets: {
      acted: {
        type: "value",
        dataMapping: { value: [ref("actions.id", "count")] },
        format: title("Stepped in"),
      },
      minutes: {
        type: "value",
        dataMapping: { value: [ref("actions.minutesToAct", "avg")] },
        format: title("Minutes to decide"),
      },
      stopped: {
        type: "value",
        dataMapping: { value: [ref("payments.kept", "sum")] },
        format: title("Kept safe"),
      },
      who: {
        type: "bar-chart-stacked",
        dataMapping: {
          categoryKey: [ref("actions.person")],
          valueKey: [ref("actions.id", "count")],
          legendKey: [ref("actions.action")],
        },
        format: withLegend("Who stepped in, and what they did"),
      },
      when: {
        type: "donut-chart",
        dataMapping: {
          categoryKey: [ref("actions.awake")],
          valueKey: [ref("actions.id", "count")],
        },
        format: title("Day or night where they live"),
      },
      list: {
        type: "grid",
        dataMapping: {
          cols: ["date", "person", "action", "payee", "amount", "minutesToAct", "awake"].map((f) => ref(`actions.${f}`)),
        },
        sort: [{ field: ref("actions.date"), direction: "desc" }],
        format: title("Every time someone stepped in"),
      },
    },
    widgetLayout: {
      acted: { xTrack: 0, yTrack: 0, xSpan: 8, ySpan: 5 },
      minutes: { xTrack: 8, yTrack: 0, xSpan: 8, ySpan: 5 },
      stopped: { xTrack: 16, yTrack: 0, xSpan: 8, ySpan: 5 },
      who: { xTrack: 0, yTrack: 5, xSpan: 15, ySpan: 13 },
      when: { xTrack: 15, yTrack: 5, xSpan: 9, ySpan: 13 },
      list: { xTrack: 0, yTrack: 18, xSpan: 24, ySpan: 12 },
    },
    filter: {
      page: [ref("actions.person"), ref("actions.action")].map((field) => ({
        field,
      })),
    },
  };

  const shares = {
    id: "shares",
    widgets: {
      total: {
        type: "value",
        dataMapping: { value: [ref("shares.amount", "sum")] },
        format: title("Paid in"),
      },
      count: {
        type: "value",
        dataMapping: { value: [ref("shares.id", "count")] },
        format: title("Shares"),
      },
      weeks: {
        type: "column-chart-stacked",
        dataMapping: {
          categoryKey: [ref("shares.week")],
          valueKey: [ref("shares.amount", "sum")],
          legendKey: [ref("shares.person")],
        },
        format: withLegend("Who put money in, week by week"),
      },
      split: {
        type: "donut-chart",
        dataMapping: {
          categoryKey: [ref("shares.person")],
          valueKey: [ref("shares.amount", "sum")],
        },
        format: title("Each person's share"),
      },
    },
    widgetLayout: {
      total: { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 5 },
      count: { xTrack: 12, yTrack: 0, xSpan: 12, ySpan: 5 },
      weeks: { xTrack: 0, yTrack: 5, xSpan: 15, ySpan: 13 },
      split: { xTrack: 15, yTrack: 5, xSpan: 9, ySpan: 13 },
    },
  };

  const pages = pot ? [money, watch, shares] : [money, watch];
  return {
    pages: narrow ? pages.map(stack) : pages,
    selectedPageId: "money",
    panels: { filters: { collapsed: true } },
  } as unknown as AgReportState;
}

type Box = { xTrack: number; yTrack: number; xSpan: number; ySpan: number };

/** On a phone: figures two to a row, then every chart and table full width, in reading order. */
function stack<P extends { widgetLayout: Record<string, Box> }>(page: P): P {
  const order = Object.entries(page.widgetLayout).sort(([, a], [, b]) => a.yTrack - b.yTrack || a.xTrack - b.xTrack);
  const widgetLayout: Record<string, Box> = {};
  let y = 0;
  let tiles = 0;
  for (const [id, box] of order) {
    const tile = box.ySpan <= 5;
    if (tile) {
      widgetLayout[id] = { xTrack: (tiles % 2) * 12, yTrack: y, xSpan: 12, ySpan: 5 };
      tiles++;
      if (tiles % 2 === 0) y += 5;
    } else {
      if (tiles % 2 === 1) y += 5;
      tiles = 0;
      widgetLayout[id] = { xTrack: 0, yTrack: y, xSpan: 24, ySpan: box.ySpan };
      y += box.ySpan;
    }
  }
  return { ...page, widgetLayout, layout: { minWidth: 300 } };
}

/** AG Studio's model boundary, answered by Tend's server. */
function tendAdapter(): AgLlmAdapter {
  return {
    executeTurn(request, options) {
      const complete: Promise<AgLlmResponse> = fetch("/api/studio/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: options?.signal,
      }).then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            status: "failed",
            output: [],
            error: {
              code: String(res.status),
              message: body.error ?? "The model didn't answer.",
            },
          };
        }
        const output: AgAiOutputItem[] = [];
        if (body.text) {
          output.push({
            id: `msg_${body.id}`,
            kind: "output",
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "text", text: body.text, annotations: [] }],
          });
        }
        for (const c of body.toolCalls as {
          callId: string;
          name: string;
          arguments: string;
        }[]) {
          output.push({
            id: `fc_${c.callId}`,
            kind: "output",
            type: "function_call",
            callId: c.callId,
            name: c.name,
            arguments: c.arguments,
            status: "completed",
          });
        }
        return {
          id: body.id,
          createdAt: Date.now(),
          status: "completed",
          output,
          usage: body.usage,
          model: body.model,
        };
      });
      const stream = {
        async *[Symbol.asyncIterator](): AsyncIterator<AgAiEvent> {
          const res = await complete;
          if (res.error) throw new Error(res.error.message);
          for (const item of res.output) {
            if (item.type === "message") {
              const text = item.content.map((c) => (c.type === "text" ? c.text : "")).join("");
              yield {
                type: "TEXT_MESSAGE_START",
                messageId: item.id,
                role: "assistant",
              };
              yield {
                type: "TEXT_MESSAGE_CONTENT",
                messageId: item.id,
                delta: text,
              };
              yield { type: "TEXT_MESSAGE_END", messageId: item.id };
            } else if (item.type === "function_call") {
              yield {
                type: "TOOL_CALL_START",
                toolCallId: item.callId,
                toolCallName: item.name,
              };
              yield {
                type: "TOOL_CALL_ARGS",
                toolCallId: item.callId,
                delta: item.arguments,
              };
              yield { type: "TOOL_CALL_END", toolCallId: item.callId };
            }
          }
        },
      };
      return { stream, complete };
    },
  };
}

type Saved = {
  state: Record<string, unknown>;
  by: string | null;
  at: string;
} | null;

const savedOn = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

export function CircleDashboard({
  report,
  aiLive,
  licenseKey,
  saved,
  memberId,
}: {
  report: CircleReport;
  aiLive: boolean;
  licenseKey?: string;
  saved: Saved;
  memberId: string;
}) {
  const [mode, setMode] = useState<AgStudioMode>("view");
  const [page, setPage] = useState("money");
  const [pageIds, setPageIds] = useState<string[]>([]);
  const api = useRef<AgStudioApi | null>(null);
  const [savedInfo, setSavedInfo] = useState(saved && { by: saved.by, at: saved.at });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const { circle } = report;

  useEffect(() => {
    setTokens(readTokens());
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTokens(readTokens());
    dark.addEventListener("change", update);
    return () => dark.removeEventListener("change", update);
  }, []);

  const data = useMemo<AgDataSourcesDefinition>(() => {
    const currency = {
      format: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: circle.currency,
        maximumFractionDigits: 0,
      }),
    };
    const day = {
      format: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
      }),
    };
    const whole = { format: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }) };
    const dated = <T extends { date: string; week: string }>(rows: T[]) =>
      rows.map((r) => ({
        ...r,
        date: new Date(r.date),
        week: new Date(`${r.week}T12:00:00Z`),
      }));
    return {
      sources: [
        {
          id: "payments",
          name: "Payments",
          description: `Every payment Tend was asked to make for ${circle.person}, and what happened to it.`,
          data: dated(report.payments),
          fields: [
            { id: "id", name: "Payment", format: "textFormat", hide: true },
            {
              id: "date",
              name: "Date",
              format: "dateFormat",
              formatOptions: day,
            },
            {
              id: "week",
              name: "Week of",
              format: "dateFormat",
              formatOptions: day,
            },
            { id: "payee", name: "Paid to", format: "textFormat" },
            { id: "category", name: "Category", format: "textFormat" },
            {
              id: "amount",
              name: "Amount",
              format: "currencyFormat",
              formatOptions: currency,
            },
            { id: "outcome", name: "What happened", format: "textFormat" },
            { id: "decision", name: "Tend's decision", format: "textFormat" },
            { id: "money", name: "Paid from", format: "textFormat" },
            { id: "sentAs", name: "Sent as", format: "textFormat" },
            {
              id: "paid",
              name: "Paid",
              format: "currencyFormat",
              formatOptions: currency,
            },
            {
              id: "kept",
              name: "Kept in their account",
              format: "currencyFormat",
              formatOptions: currency,
            },
            { id: "scamRisk", name: "Scam risk", format: "percentageFormat" },
          ],
        },
        {
          id: "actions",
          name: "The circle stepping in",
          description: "Every time someone in the circle stopped a payment, let one go, or said yes or no.",
          data: dated(report.actions),
          fields: [
            { id: "id", name: "Step", format: "textFormat", hide: true },
            {
              id: "date",
              name: "Date",
              format: "dateFormat",
              formatOptions: day,
            },
            {
              id: "week",
              name: "Week of",
              format: "dateFormat",
              formatOptions: day,
            },
            { id: "person", name: "Who", format: "textFormat" },
            { id: "relation", name: "Relation", format: "textFormat" },
            { id: "action", name: "What they did", format: "textFormat" },
            { id: "payee", name: "Payment to", format: "textFormat" },
            {
              id: "amount",
              name: "Amount",
              format: "currencyFormat",
              formatOptions: currency,
            },
            {
              id: "minutesToAct",
              name: "Minutes to decide",
              format: "integerFormat",
              formatOptions: whole,
            },
            { id: "awake", name: "Their time of day", format: "textFormat" },
          ],
        },
        ...(circle.pot
          ? [
              {
                id: "shares",
                name: "Shares paid in",
                description: "Money the family paid into the shared care pot, by PayPal invoice or checkout.",
                data: dated(report.shares),
                fields: [
                  { id: "id", name: "Share", format: "textFormat", hide: true },
                  {
                    id: "date",
                    name: "Date",
                    format: "dateFormat",
                    formatOptions: day,
                  },
                  {
                    id: "week",
                    name: "Week of",
                    format: "dateFormat",
                    formatOptions: day,
                  },
                  { id: "person", name: "Who", format: "textFormat" },
                  {
                    id: "amount",
                    name: "Amount",
                    format: "currencyFormat",
                    formatOptions: currency,
                  },
                  { id: "via", name: "Paid by", format: "textFormat" },
                ],
              },
            ]
          : []),
      ],
    } as AgDataSourcesDefinition;
  }, [report, circle]);

  // The circle's saved dashboard if someone saved one; Tend's otherwise. Only read on first render.
  const narrow = () => window.matchMedia("(max-width: 767px)").matches;
  const initialState = useMemo(() => (saved?.state as unknown as AgReportState) ?? startingReport(circle.pot, narrow()), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const state = api.current?.getState();
    if (!state) return;
    setBusy(true);
    const res = await fetch("/api/dashboard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, state }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setNote(body.error ?? "Couldn't save it. Try again.");
    setSavedInfo({ by: body.by, at: body.at });
    setNote("Saved. Everyone in the circle opens this dashboard now.");
  }

  async function reset() {
    setBusy(true);
    const res = await fetch("/api/dashboard", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    setBusy(false);
    if (!res.ok) return setNote("Couldn't reset it. Try again.");
    api.current?.setState(startingReport(circle.pot, narrow()));
    setSavedInfo(null);
    setNote("Back to Tend's dashboard, for everyone.");
  }

  const theme = useMemo(
    () =>
      tokens &&
      studioTheme.withParams({
        fontFamily: tokens.font,
        backgroundColor: tokens.enamel,
        foregroundColor: tokens.ink,
        textColor: tokens.ink,
        subtleTextColor: tokens.inkSoft,
        borderColor: tokens.rule,
        accentColor: tokens.accent,
        borderRadius: 12,
        browserColorScheme: "inherit",
        ...Object.fromEntries(
          tokens.palette.flatMap((c, n) => [
            [`chartPaletteFills${n + 1}Color`, c],
            [`chartPaletteStrokes${n + 1}Color`, c],
          ]),
        ),
      }),
    [tokens],
  );

  const ai = useMemo(
    () =>
      aiLive
        ? ({ api }: { api: Parameters<typeof createAiHarness>[0] }) =>
            createAiHarness(api, {
              adapter: tendAdapter(),
              promptStarters: [
                {
                  label: "What did Tend keep?",
                  prompt: `Add a chart of the money kept in ${circle.person}'s account each week, by what happened.`,
                },
                {
                  label: "Who stepped in?",
                  prompt: "Which person in the circle stepped in most, and how quickly did they decide?",
                },
                {
                  label: "Biggest payees",
                  prompt: "Show the ten payees with the most money paid, as a bar chart.",
                },
              ],
            })
        : undefined,
    [aiLive, circle.person],
  );

  if (!theme) return <div className="skeleton h-[70vh] w-full rounded-2xl" aria-label="Loading the dashboard" />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Dashboard pages" className="flex flex-wrap gap-1.5">
          {(pageIds.length ? pageIds : initialState.pages.map((p) => p.id)).map((id, n) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={page === id}
              onClick={() => {
                const current = api.current?.getState();
                if (current) api.current?.setState({ ...current, selectedPageId: id });
                setPage(id);
              }}
              className={`min-h-10 rounded-xl border-2 px-3.5 text-sm font-bold transition-colors ${page === id ? "border-action bg-action text-action-ink" : "border-rule text-ink hover:border-rule-strong"}`}
            >
              {PAGES.find((p) => p.id === id)?.label ?? `Page ${n + 1}`}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-soft" role="status">
          {note ??
            (mode === "view"
              ? `Click any bar or slice to filter the rest of the page.${savedInfo ? ` Saved by ${savedInfo.by ?? "the circle"} on ${savedOn.format(new Date(savedInfo.at))}.` : ""}`
              : aiLive
                ? "Drag fields onto the canvas, or ask the assistant to build it for you. Save it and the whole circle sees it."
                : "Drag fields onto the canvas to build your own view. Save it and the whole circle sees it.")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "edit" && (
            <>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-action px-3.5 text-sm font-bold text-action-ink transition-colors hover:bg-action-hover disabled:opacity-55"
              >
                <Save aria-hidden size={16} />
                Save for the circle
              </button>
              {savedInfo && (
                <button
                  type="button"
                  onClick={reset}
                  disabled={busy}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-rule px-3.5 text-sm font-bold text-ink transition-colors hover:border-rule-strong disabled:opacity-55"
                >
                  <RotateCcw aria-hidden size={16} />
                  Back to Tend&apos;s
                </button>
              )}
            </>
          )}
          <div role="group" aria-label="Dashboard mode" className="inline-flex rounded-xl border-2 border-rule p-0.5">
            {(
              [
                ["view", "Read it", Eye],
                ["edit", "Build your own", PencilRuler],
              ] as const
            ).map(([m, label, Icon]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setNote(null);
                }}
                className={`inline-flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-sm font-bold transition-colors ${mode === m ? "bg-action text-action-ink" : "text-ink hover:bg-enamel"}`}
              >
                <Icon aria-hidden size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="h-[78vh] min-h-[560px] overflow-hidden rounded-2xl border-2 border-rule">
        <AgStudioProvider modules={aiLive ? [AgStudioAiModule] : []} licenseKey={licenseKey}>
          <AgStudio
            data={data}
            initialState={initialState}
            mode={mode}
            theme={theme}
            ai={ai}
            style={{ height: "100%", width: "100%" }}
            onApiReady={(e) => {
              api.current = e.api;
            }}
            onStateUpdated={(e) => {
              // The assistant or the editor can add and remove pages; keep the tabs in step.
              setPageIds(e.state.pages.map((p) => p.id));
              setPage(e.state.selectedPageId);
            }}
          />
        </AgStudioProvider>
      </div>
    </div>
  );
}
