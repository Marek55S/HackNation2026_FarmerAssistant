"use client";

import { useState } from "react";
import { addDays, historyWindow, MIN_DATE, periodDays, shortDate, validatePeriod } from "@/lib/dates";

type Mode = "dzis" | "dzien" | "okres";

const MODES: { id: Mode; label: string }[] = [
  { id: "dzis", label: "Dziś" },
  { id: "dzien", label: "Wybrany dzień" },
  { id: "okres", label: "Przedział" },
];

export interface DateChoice {
  /** Analysis date D = end of the period */
  date: string;
  /** Start of the period, or null for a single day */
  from: string | null;
  valid: boolean;
}

const inputCls = "min-h-11 rounded-xl border border-rule-strong bg-paper px-3.5 text-[15px] text-ink focus:border-primary focus:outline-none";

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
  const [mode, setMode] = useState<Mode>(from ? "okres" : date === today ? "dzis" : "dzien");
  // Raw input values (may be invalid while the farmer is typing).
  const [day, setDay] = useState(date);
  const [rangeFrom, setRangeFrom] = useState(from ?? addDays(date, -29));
  const [rangeTo, setRangeTo] = useState(date);

  const emit = (to: string, fr: string | null) => onChange({ date: to, from: fr, valid: validatePeriod(fr, to, today) === null });

  function pickMode(m: Mode) {
    setMode(m);
    if (m === "dzis") emit(today, null);
    else if (m === "dzien") emit(day, null);
    else emit(rangeTo, rangeFrom);
  }

  const error = mode === "dzis" ? null : validatePeriod(mode === "okres" ? rangeFrom : null, mode === "okres" ? rangeTo : day, today);
  const end = error ? null : mode === "dzis" ? today : mode === "dzien" ? day : rangeTo;
  const win = end ? historyWindow(end) : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div role="radiogroup" aria-label="Okres analizy" className="flex flex-wrap gap-1 self-start rounded-xl bg-chip p-1 max-sm:grid max-sm:grid-cols-3 max-sm:self-stretch">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => pickMode(m.id)}
            className={`min-h-11 rounded-[9px] px-4 text-sm max-sm:px-1.5 max-sm:text-[13px] max-sm:leading-tight ${mode === m.id ? "bg-paper font-semibold text-ink shadow-sm" : "font-medium text-ink-3 hover:text-ink"}`}
          >
            {m.id === "dzis" ? `Dziś · ${shortDate(today)}` : m.label}
          </button>
        ))}
      </div>

      {mode === "dzien" && (
        <label className="flex flex-col gap-2 self-start text-sm font-semibold">
          Dzień analizy
          <input
            type="date"
            min={MIN_DATE}
            max={today}
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              emit(e.target.value, null);
            }}
            className={inputCls}
            aria-invalid={!!error}
          />
        </label>
      )}

      {mode === "okres" && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-2 text-sm font-semibold max-sm:flex-1">
            Od
            <input
              type="date"
              min={MIN_DATE}
              max={today}
              value={rangeFrom}
              onChange={(e) => {
                setRangeFrom(e.target.value);
                emit(rangeTo, e.target.value);
              }}
              className={inputCls}
              aria-invalid={!!error}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold max-sm:flex-1">
            Do
            <input
              type="date"
              min={MIN_DATE}
              max={today}
              value={rangeTo}
              onChange={(e) => {
                setRangeTo(e.target.value);
                emit(e.target.value, rangeFrom);
              }}
              className={inputCls}
              aria-invalid={!!error}
            />
          </label>
        </div>
      )}

      <div aria-live="polite">
        {error ? (
          <p className="rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn-ink">{error}</p>
        ) : (
          win &&
          end && (
            <span className="text-sm text-ink-2">
              {mode === "okres" ? (
                <>
                  Podsumujemy okres{" "}
                  <b>
                    {shortDate(rangeFrom)} – {shortDate(rangeTo)}
                  </b>{" "}
                  ({periodDays(rangeFrom, rangeTo)} dni) i porównamy go z tym samym okresem w 10 poprzednich latach. Zalecenia
                  policzymy na dzień {shortDate(rangeTo)}.
                </>
              ) : (
                <>
                  Porównamy z 10 latami:{" "}
                  <b>
                    {win.from} – {win.to}
                  </b>
                  . Liczymy tylko z danych dostępnych do tego dnia.
                </>
              )}
            </span>
          )
        )}
      </div>

      {win?.hasOldImagery && (
        <span className="rounded-lg bg-warn-bg px-3 py-2.5 text-[13px] leading-snug text-warn-ink">
          Dla lat przed 2016 zdjęcia satelitarne są mniej szczegółowe (Landsat 30 m), a prognozy z tamtego dnia nie da się
          odtworzyć — raport powie, jak to wpływa na pewność.
        </span>
      )}
      {win && (
        <details className="text-[13px] text-ink-2">
          <summary className="min-h-7 font-semibold text-primary">Skąd dane dla tych lat?</summary>
          <div className="flex flex-col gap-2 pt-2">
            <div className="grid grid-cols-10 gap-1">
              {win.years.map((yr) => (
                <div key={yr.year} className="flex flex-col gap-1">
                  <span title={yr.tip} className={`block h-2.5 rounded-[3px] ${yr.sensor === "s2" ? "bg-primary" : "bg-blue"}`} />
                  <span className="tabular text-center text-[11px] max-sm:text-[9px]">{yr.year}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-3.5 rounded-sm bg-primary" />
                zdjęcia Sentinel-2 · 10 m
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-3.5 rounded-sm bg-blue" />
                zdjęcia Landsat · 30 m
              </span>
              <span>pogoda i bilans wody: wszystkie lata (ERA5-Land) · uprawy: deklaracje ARiMR 2020–2026, mapa upraw JRC 2018 i 2022</span>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
