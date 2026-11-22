"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { farmEntry, OPENING_KEY, thumbShape, useFarm } from "@/lib/farm";
import { longDate, periodDays, shortDate } from "@/lib/dates";
import type { AnalyzeEvent, CropId, ParcelLookup, PartChoice, Report } from "@/lib/types";
import { effectiveParts } from "./crop-parts";
import { encodeParts } from "@/lib/backend";
import { AppHeader } from "../app-header";
import { Backdrop } from "../backdrop";
import { MobileNav } from "../mobile-nav";
import { ThemeToggle } from "../theme-toggle";
import { Card, ICON, Icon } from "../ui";
import { DatePicker, defaultFrom, type DateChoice } from "./date-picker";
import { ParcelPicker } from "./parcel-picker";
import { FarmPanel, ProgressPanel, type ProgressState } from "./side-panels";

export function StartScreen({
  today,
  initialParcelId,
  initialDate,
  initialFrom,
}: {
  today: string;
  initialParcelId: string;
  initialDate: string;
  initialFrom: string | null;
}) {
  const router = useRouter();
  const { farm, upsert, remove } = useFarm();
  const [lookup, setLookup] = useState<ParcelLookup | null>(null);
  // Uprawa wskazana przez rolnika dla wykrytej części (klucz = id części) i części dodane ręcznie.
  const [choices, setChoices] = useState<Record<string, CropId | null>>({});
  const [added, setAdded] = useState<PartChoice[]>([]);
  const [date, setDate] = useState(initialDate);
  const [from, setFrom] = useState<string | null>(() => initialFrom ?? defaultFrom(initialDate));
  const [dateValid, setDateValid] = useState(true);
  const [status, setStatus] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const onDate = useCallback((c: DateChoice) => {
    setDateValid(c.valid);
    if (!c.valid) return;
    setDate(c.date);
    setFrom(c.from);
  }, []);

  const onLookup = useCallback((l: ParcelLookup | null) => {
    setLookup((prev) => {
      // Podział należy do konkretnej działki i roku – przy zmianie działki zaczynamy od tego, co podają źródła.
      if (prev?.parcel.id !== l?.parcel.id) {
        setChoices({});
        setAdded([]);
      }
      return l;
    });
  }, []);

  const onChoice = useCallback((id: string, c: CropId | null) => setChoices((p) => ({ ...p, [id]: c })), []);

  // Części, które pójdą do analizy: wykryte z nadpisaniami rolnika plus dodane ręcznie.
  // „brak” też jest wyborem — pozwala iść dalej bez zaleceń polowych.
  const parts = lookup ? effectiveParts(lookup.parts, choices, added) : [];
  const withCrop = parts.filter((p) => p.crop);
  const cropMissing = !!lookup && !lookup.outOfScope && withCrop.length === 0;
  const canStart = !!lookup && !cropMissing && dateValid && !running;

  // Enter in a parcel field starts the analysis. Pressed before the lookup answered (it waits 350 ms after typing),
  // it is remembered for a few seconds and the analysis starts as soon as the parcel is found.
  const enterAt = useRef(0);
  function onParcelKey(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    if (canStart) start();
    else enterAt.current = Date.now();
  }
  useEffect(() => {
    if (!canStart || !enterAt.current) return;
    const fresh = Date.now() - enterAt.current < 6000;
    enterAt.current = 0;
    if (fresh) start();
    // `start` reads the current state when called; only the moment the parcel becomes ready matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canStart]);

  function saveToFarm(report: Report, url: string) {
    upsert(farmEntry(report, url));
  }

  async function start() {
    if (!lookup || !canStart) return;
    setRunning(true);
    setError(null);
    setStatus(null);
    setTimeout(() => progressRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ dzialka: lookup.parcel.id, data: date, od: from ?? undefined, czesci: withCrop }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Nie udało się uruchomić analizy.");
      }
      // NDJSON: one event per line — progress updates, then the report.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as AnalyzeEvent;
          if (ev.type === "progress") setStatus({ elapsed: ev.elapsed, progress: ev.progress, steps: ev.steps, done: false });
          else if (ev.type === "error") throw new Error(ev.error);
          else {
            setStatus((s) => (s ? { ...s, progress: 100, done: true } : s));
            saveToFarm(ev.report, ev.url);
            // The report page loads on the server once more: tell its loading screen the analysis is already done.
            try {
              sessionStorage.setItem(OPENING_KEY, String(Date.now()));
            } catch {
              // storage blocked — the loading screen just shows the steps again
            }
            router.push(ev.url);
            return;
          }
        }
      }
      throw new Error("Analiza przerwana — spróbuj ponownie.");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(
        (e as Error).message === "Failed to fetch"
          ? "Brak połączenia z internetem. Ostatnio otwarte raporty są dostępne w „Twoim gospodarstwie”."
          : (e as Error).message,
      );
      // The step list is simulated on a timer, so after an error it would keep spinning — show only the error.
      setStatus(null);
      setRunning(false);
    }
  }

  function addToFarm() {
    if (!lookup) return;
    const { parcel } = lookup;
    const q = new URLSearchParams({ dzialka: parcel.id, data: date });
    if (from) q.set("od", from);
    const cz = encodeParts(withCrop);
    if (cz) q.set("cz", cz);
    upsert({
      parcelId: parcel.id,
      name: parcel.number,
      meta: `${parcel.areaHa.toLocaleString("pl-PL")} ha · ${parcel.landUse} · jeszcze nie sprawdzona`,
      status: "Nowa",
      tone: null,
      url: cropMissing ? `/?dzialka=${encodeURIComponent(parcel.id)}` : `/raport?${q}`,
      checkedAt: "",
      shape: thumbShape(parcel.geometry),
    });
  }

  return (
    <div className="relative isolate min-h-screen pb-24 text-ink md:pb-0">
      <Backdrop />
      <AppHeader active="start" reportHref={farm.find((f) => f.tone)?.url ?? null}>
        <ThemeToggle />
      </AppHeader>

      <main className="mx-auto flex max-w-[1376px] flex-wrap items-start gap-6 px-8 pb-12 pt-8 max-sm:gap-4 max-sm:px-4 max-sm:pt-4">
        <Card className="flex min-w-0 flex-[999_1_560px] flex-col gap-7 p-8 max-sm:gap-6 max-sm:p-4">
          {/* The whole request as one sentence that follows the choices below (day, period, parcel). */}
          <h1 style={{ "--d": "0ms" } as React.CSSProperties} className="rise text-[32px] font-semibold leading-[1.35] tracking-tight text-heading max-sm:text-[24px]">
            Sprawdź wodę na <SentenceWord empty={!lookup}>{lookup ? `działce ${lookup.parcel.number}` : "swojej działce"}</SentenceWord> na{" "}
            <SentenceWord invalid={!dateValid}>{date === today ? "dziś" : longDate(date)}</SentenceWord>, licząc z{" "}
            <SentenceWord invalid={!dateValid}>{periodWords(from, date)}</SentenceWord>.
          </h1>

          {/* Najpierw data: od roku daty zależy, którą deklarację upraw (ARiMR / mapa upraw) sprawdzamy dla działki. */}
          <div style={{ "--d": "70ms" } as React.CSSProperties} className="rise flex flex-col gap-3.5">
            <h2 className="text-[17px] font-semibold text-heading">Dzień</h2>
            <DatePicker date={date} from={from} today={today} onChange={onDate} />
          </div>

          <div style={{ "--d": "130ms" } as React.CSSProperties} className="rise flex flex-col gap-3.5" onKeyDown={onParcelKey}>
            <h2 className="text-[17px] font-semibold text-heading">Działka</h2>
            <ParcelPicker
              initialId={initialParcelId}
              date={date}
              lookup={lookup}
              onLookup={onLookup}
              choices={choices}
              added={added}
              onChoice={onChoice}
              onAdded={setAdded}
            />
          </div>

          <div style={{ "--d": "180ms" } as React.CSSProperties} className="rise flex flex-wrap items-center gap-4 border-t border-rule-soft pt-4">
            <button
              onClick={start}
              disabled={!canStart}
              aria-describedby="start-hint"
              className="cta inline-flex min-h-14 items-center gap-2.5 rounded-[var(--r-btn)] bg-btn px-7 text-lg font-bold text-btn-ink hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full max-sm:justify-center"
            >
              {running ? "Analizuję…" : "Sprawdź działkę"}
              <Icon d={ICON.arrowRight} size={20} stroke={2.5} />
            </button>
            <span id="start-hint" className="max-w-[440px] text-[13px] text-muted">
              {!lookup
                ? "Najpierw wskaż działkę."
                : cropMissing
                  ? "Wskaż uprawę albo „Brak uprawy” dla przynajmniej jednej części, żeby zacząć."
                  : !dateValid
                    ? "Popraw datę, żeby zacząć."
                    : null}
            </span>
          </div>
        </Card>

        <aside style={{ "--d": "110ms" } as React.CSSProperties} className="rise flex min-w-0 flex-[1_1_380px] flex-col gap-6 max-sm:gap-4">
          {(running || status || error) && (
            <div ref={progressRef} className="scroll-mt-4">
              <ProgressPanel status={status} error={error} />
            </div>
          )}
          <FarmPanel farm={farm} onAdd={addToFarm} onRemove={remove} canAdd={!!lookup} />
        </aside>
      </main>

      <MobileNav active="dzialki" reportHref={farm.find((f) => f.tone)?.url ?? null} />
    </div>
  );
}

/** The data period in words for the sentence ("ostatniego miesiąca"); a custom range shows its dates. */
function periodWords(from: string | null, to: string): string {
  if (!from) return "tego jednego dnia";
  const words: Record<number, string> = { 7: "ostatniego tygodnia", 30: "ostatniego miesiąca", 90: "ostatnich 3 miesięcy", 365: "ostatniego roku" };
  return words[periodDays(from, to)] ?? `dni ${shortDate(from)} – ${shortDate(to)}`;
}

/** A word in the sentence that reflects a choice made below; it changes as the farmer picks. */
function SentenceWord({ children, empty = false, invalid = false }: { children: React.ReactNode; empty?: boolean; invalid?: boolean }) {
  return (
    <span
      className={`sentence-word rounded-md underline decoration-2 underline-offset-[7px] [box-decoration-break:clone] ${
        invalid ? "bg-warn-bg text-warn-ink decoration-warn-ink" : empty ? "text-muted decoration-dashed decoration-rule-strong" : "text-heading decoration-primary-border"
      }`}
    >
      {children}
    </span>
  );
}
