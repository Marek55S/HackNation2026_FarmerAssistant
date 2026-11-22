"use client";

import { useState } from "react";
import { SlidingPill } from "../sliding-pill";
import { addDays, MIN_DATE, parseIso, periodDays, shortDate, validatePeriod } from "@/lib/dates";

export interface DateChoice {
  /** Analysis date D = end of the data period */
  date: string;
  /** Start of the data period (null when the date is the first supported day) */
  from: string | null;
  valid: boolean;
}

/** How far back from the analysis date the data period reaches (both ends included). */
const PERIODS = [
  { id: "7", label: "Tydzień", short: "Tydzień", days: 7 },
  { id: "30", label: "Miesiąc", short: "Miesiąc", days: 30 },
  { id: "90", label: "3 miesiące", short: "3 mies.", days: 90 },
  { id: "365", label: "Rok", short: "Rok", days: 365 },
] as const;
type PresetId = (typeof PERIODS)[number]["id"];
type PeriodId = PresetId | "wlasny";
const DEFAULT_PERIOD: PresetId = "30";
const presetDays = (id: PresetId) => PERIODS.find((p) => p.id === id)!.days;

/** Period start for an analysis date; never earlier than the first supported day. */
export function periodStart(date: string, days: number): string {
  const f = addDays(date, -(days - 1));
  return f < MIN_DATE ? MIN_DATE : f;
}

/** `od` for the API: must be before the analysis date. */
const apiFrom = (date: string, days: number) => {
  const f = periodStart(date, days);
  return f < date ? f : null;
};

/** Period start for the default period, used before the farmer touches the picker. */
export const defaultFrom = (date: string) => apiFrom(date, presetDays(DEFAULT_PERIOD));

const MONTHS = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Day/month/year as the farmer enters them; the day stays raw text so it can be cleared and retyped. */
interface Fields {
  d: string;
  m: number;
  y: number;
}

const toFields = (iso: string): Fields => {
  const p = parseIso(iso);
  return { d: String(p.d), m: p.m, y: p.y };
};

function readFields(f: Fields): { iso: string | null; dayError: string | null } {
  const n = Number(f.d);
  if (!/^\d{1,2}$/.test(f.d) || n < 1) return { iso: null, dayError: "Wpisz dzień miesiąca." };
  const max = daysIn(f.y, f.m);
  if (n > max) {
    const name = MONTHS[f.m - 1];
    return { iso: null, dayError: `${name[0].toUpperCase()}${name.slice(1)} ${f.y} ma ${max} dni.` };
  }
  return { iso: `${f.y}-${pad(f.m)}-${pad(n)}`, dayError: null };
}

interface State {
  mode: "dzis" | "dzien";
  period: PeriodId;
  end: Fields;
  start: Fields;
}

/** Everything the picker shows and reports, derived from what the farmer entered. */
function derive(s: State, today: string, fallback: string) {
  const endRead = s.mode === "dzis" ? { iso: today, dayError: null } : readFields(s.end);
  const endError = endRead.dayError ?? validatePeriod(null, endRead.iso!, today);
  const end = endError ? null : endRead.iso;

  let from: string | null = null;
  let startDayError: string | null = null;
  let periodError: string | null = null;
  if (s.period === "wlasny") {
    const r = readFields(s.start);
    startDayError = r.dayError;
    from = r.iso;
    periodError = startDayError ?? (end && from ? validatePeriod(from, end, today) : null);
  } else if (end) {
    from = apiFrom(end, presetDays(s.period));
  }

  return {
    end,
    endError,
    endDayError: s.mode === "dzien" ? endRead.dayError : null,
    from,
    startDayError,
    periodError,
    choice: { date: end ?? fallback, from, valid: !endError && !periodError } satisfies DateChoice,
  };
}

const fieldCls =
  "min-h-11 rounded-xl border border-rule-strong bg-paper px-3 text-[15px] text-ink focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 aria-[invalid=true]:border-warn-ink max-sm:px-2";

function DateFields({
  value,
  years,
  dayInvalid,
  invalid,
  onChange,
}: {
  value: Fields;
  years: number[];
  dayInvalid: boolean;
  invalid: boolean;
  onChange: (f: Fields) => void;
}) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_6.5rem] gap-2.5 max-sm:grid-cols-[3.5rem_minmax(0,1fr)_5.5rem] max-sm:gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
        Dzień
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={2}
          value={value.d}
          onChange={(e) => onChange({ ...value, d: e.target.value.replace(/\D/g, "") })}
          className={`${fieldCls} tabular text-center`}
          aria-invalid={dayInvalid || invalid}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
        Miesiąc
        <select value={value.m} onChange={(e) => onChange({ ...value, m: Number(e.target.value) })} className={fieldCls} aria-invalid={invalid}>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-3">
        Rok
        <select value={value.y} onChange={(e) => onChange({ ...value, y: Number(e.target.value) })} className={`${fieldCls} tabular`} aria-invalid={invalid}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

const panelCls =
  "flex flex-col gap-3 rounded-xl border border-rule-soft bg-paper p-4 sm:max-w-[480px] max-sm:border-0 max-sm:bg-transparent max-sm:p-0";

const ErrorNote = ({ text }: { text: string | null }) => (
  <div aria-live="polite">{text && <p className="reveal rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn-ink">{text}</p>}</div>
);

export function DatePicker({
  date,
  from,
  today,
  onChange,
}: {
  date: string;
  from: string | null;
  today: string;
  onChange: (c: DateChoice) => void;
}) {
  const [state, setState] = useState<State>(() => {
    // A `from` from the URL that matches no preset opens the custom period.
    const preset = from ? PERIODS.find((p) => periodDays(from, date) === p.days)?.id : DEFAULT_PERIOD;
    return {
      mode: date === today ? "dzis" : "dzien",
      period: preset ?? "wlasny",
      end: toFields(date),
      start: toFields(from ?? periodStart(date, presetDays(DEFAULT_PERIOD))),
    };
  });

  const minY = parseIso(MIN_DATE).y;
  const maxY = parseIso(today).y;
  const years = Array.from({ length: maxY - minY + 1 }, (_, i) => maxY - i);

  const view = derive(state, today, date);

  function commit(patch: Partial<State>) {
    const next = { ...state, ...patch };
    // Opening the custom period starts from the range the farmer was just looking at.
    if (patch.period === "wlasny" && state.period !== "wlasny" && view.end) {
      next.start = toFields(periodStart(view.end, presetDays(state.period)));
    }
    setState(next);
    onChange(derive(next, today, date).choice);
  }

  const tile = (on: boolean) =>
    `flex min-h-[68px] flex-col items-start justify-center gap-0.5 rounded-xl border px-4 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
      on ? "border-primary bg-primary-tint text-heading" : "border-rule-strong bg-paper text-ink hover:border-primary-border hover:bg-chip"
    }`;

  const custom = state.period === "wlasny";
  const rangeOk = view.end && view.from && !view.periodError;
  const shownFrom = custom ? view.from : view.end && periodStart(view.end, presetDays(state.period as PresetId));

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Dzień analizy" className="grid grid-cols-2 gap-2.5 sm:max-w-[480px]">
        <button type="button" role="radio" aria-checked={state.mode === "dzis"} onClick={() => commit({ mode: "dzis" })} className={tile(state.mode === "dzis")}>
          <span className="text-[15px] font-semibold">Dziś</span>
          <span className={`tabular text-[13px] ${state.mode === "dzis" ? "text-heading" : "text-ink-3"}`}>{shortDate(today)}</span>
        </button>
        <button type="button" role="radio" aria-checked={state.mode === "dzien"} onClick={() => commit({ mode: "dzien" })} className={tile(state.mode === "dzien")}>
          <span className="text-[15px] font-semibold">Wybrany dzień</span>
          <span className={`tabular text-[13px] ${state.mode === "dzien" ? "text-heading" : "text-ink-3"}`}>
            {state.mode === "dzien" && view.end ? shortDate(view.end) : "Inna data"}
          </span>
        </button>
      </div>

      {state.mode === "dzien" && (
        <div className={`${panelCls} reveal`}>
          <DateFields
            value={state.end}
            years={years}
            dayInvalid={!!view.endDayError}
            invalid={!!view.endError && !view.endDayError}
            onChange={(end) => commit({ end })}
          />
          <ErrorNote text={view.endError} />
        </div>
      )}

      <div className="mt-2 flex flex-col gap-2">
        <span id="okres-label" className="text-sm font-semibold">
          Okres danych
        </span>
        <div
          role="radiogroup"
          aria-labelledby="okres-label"
          aria-describedby="okres-hint"
          className="relative grid grid-cols-5 gap-1 self-start rounded-[22px] bg-chip p-1 max-sm:self-stretch"
        >
          <SlidingPill active={state.period} />
          {[...PERIODS, { id: "wlasny" as const, label: "Własny", short: "Własny" }].map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={state.period === p.id}
              aria-label={p.label}
              onClick={() => commit({ period: p.id })}
              className={`relative min-h-10 whitespace-nowrap rounded-full px-4 text-sm max-sm:px-1 max-sm:text-[13px] ${
                state.period === p.id ? "font-semibold text-ink" : "font-medium text-ink-3 hover:text-ink"
              }`}
            >
              <span className="max-sm:hidden">{p.label}</span>
              <span className="sm:hidden">{p.short}</span>
            </button>
          ))}
        </div>

        {custom && (
          <div className={`${panelCls} reveal mt-1`}>
            <span className="text-xs font-semibold text-ink-2">
              Od dnia{view.end ? <> · do {shortDate(view.end)}</> : null}
            </span>
            <DateFields
              value={state.start}
              years={years}
              dayInvalid={!!view.startDayError}
              invalid={!!view.periodError && !view.startDayError}
              onChange={(start) => commit({ start })}
            />
            <ErrorNote text={view.periodError} />
          </div>
        )}

        <span id="okres-hint" className="text-[13px] text-muted">
          {(custom ? rangeOk : view.end) && shownFrom ? (
            <>
              Opady, wilgotność gleby i zdjęcia satelitarne z dni{" "}
              <b className="font-semibold tabular">
                {shortDate(shownFrom)} – {shortDate(view.end!)}
              </b>
              {custom && <> ({periodDays(shownFrom, view.end!)} dni)</>}, porównane z tym samym okresem w 10 poprzednich latach.
            </>
          ) : (
            "Opady, wilgotność gleby i zdjęcia satelitarne z tego okresu, porównane z 10 poprzednimi latami."
          )}
        </span>
      </div>
    </div>
  );
}
