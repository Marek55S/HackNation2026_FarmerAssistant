"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFarm } from "@/lib/farm";
import type { AnalyzeEvent, CropId, ParcelLookup, Report } from "@/lib/types";
import { AppHeader } from "../app-header";
import { MobileNav } from "../mobile-nav";
import { ThemeToggle } from "../theme-toggle";
import { Card, ICON, Icon, StepNumber } from "../ui";
import { longDate } from "@/lib/dates";
import { DatePicker, type DateChoice } from "./date-picker";
import { ParcelPicker } from "./parcel-picker";
import { FarmPanel, ProgressPanel, type ProgressState } from "./side-panels";

const FARM_STATUS: Record<Report["status"]["tone"], string> = {
  susza: "Pilne",
  zagrozenie: "Do obserwacji",
  spokojnie: "W porządku",
  plan: "Zrób przed sezonem",
  "poza-zakresem": "Poza zakresem",
};

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
  const [crop, setCrop] = useState<CropId | null>(null);
  const [date, setDate] = useState(initialDate);
  const [from, setFrom] = useState<string | null>(initialFrom);
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
      // Keep the farmer's crop choice when only the date changed for the same parcel.
      if (prev?.parcel.id !== l?.parcel.id) setCrop(null);
      return l;
    });
  }, []);

  const cropMissing = !!lookup && !lookup.outOfScope && !lookup.cropHint && !crop;
  // Uprawa do analizy = to, co rolnik widzi na karcie działki: własny wybór albo podpowiedź (kliknięte pole ARiMR / mapa upraw).
  const chosenCrop = crop ?? lookup?.cropHint?.crop ?? null;
  const canStart = !!lookup && !cropMissing && dateValid && !running;

  function saveToFarm(report: Report, url: string) {
    const p = report.parcel;
    upsert({
      parcelId: p.id,
      name: `${p.number}${report.crop ? ` · ${report.crop.name.toLowerCase()}` : ""}`,
      meta: `${p.areaHa.toLocaleString("pl-PL")} ha · ${report.urgent ? report.urgent.title.toLowerCase() : report.status.label.toLowerCase()}`,
      status: FARM_STATUS[report.status.tone],
      tone: report.status.tone,
      url,
      checkedAt: new Date().toISOString(),
    });
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
        body: JSON.stringify({ dzialka: lookup.parcel.id, data: date, od: from ?? undefined, uprawa: chosenCrop ?? undefined }),
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
    if (chosenCrop) q.set("uprawa", chosenCrop);
    upsert({
      parcelId: parcel.id,
      name: parcel.number,
      meta: `${parcel.areaHa.toLocaleString("pl-PL")} ha · ${parcel.landUse} · jeszcze nie sprawdzona`,
      status: "Nowa",
      tone: null,
      url: cropMissing ? `/?dzialka=${encodeURIComponent(parcel.id)}` : `/raport?${q}`,
      checkedAt: "",
    });
  }

  return (
    <div className="min-h-screen bg-bg pb-24 text-ink md:pb-0">
      <AppHeader active="start" reportHref={farm.find((f) => f.tone)?.url ?? null}>
        <ThemeToggle />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-3 py-2 text-xs font-semibold text-heading max-lg:hidden">
          <Icon d={ICON.lock} size={14} />
          Bez logowania · bez danych osobowych
        </span>
      </AppHeader>

      <main className="mx-auto flex max-w-[1376px] flex-wrap items-start gap-6 px-8 pb-12 pt-8 max-sm:gap-4 max-sm:px-4 max-sm:pt-4">
        <Card className="flex min-w-0 flex-[999_1_560px] flex-col gap-7 p-8 max-sm:gap-6 max-sm:p-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-[34px] font-bold leading-[1.1] tracking-tight max-sm:text-[27px]">
              Sprawdź wodę <span className="accent-word">na swojej działce</span>
            </h1>
            <p className="inline-flex items-center gap-1.5 text-sm text-ink-2">
              <Icon d={ICON.calendar} size={16} className="text-muted" />
              {longDate(today)}
            </p>
            <p className="max-w-[60ch] text-base text-ink-3">
              Podaj działkę i dzień. Glebę, teren i pogodę z 10 lat pobierzemy sami, uprawę podpowiemy z deklaracji ARiMR.
            </p>
          </div>

          {/* Najpierw data: od roku daty zależy, którą deklarację upraw (ARiMR / mapa upraw) sprawdzamy dla działki. */}
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <StepNumber n={1} />
              <h2 className="text-[19px] font-bold">Na jaki dzień lub okres?</h2>
            </div>
            <DatePicker date={date} from={from} today={today} onChange={onDate} />
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <StepNumber n={2} />
              <h2 className="text-[19px] font-bold">Wskaż działkę</h2>
            </div>
            <ParcelPicker initialId={initialParcelId} date={date} lookup={lookup} onLookup={onLookup} crop={crop} onCrop={setCrop} />
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-rule-soft pt-4">
            <button
              onClick={start}
              disabled={!canStart}
              aria-describedby="start-hint"
              className="inline-flex min-h-14 items-center gap-2.5 rounded-[var(--r-btn)] bg-btn px-7 text-lg font-bold text-btn-ink hover:bg-btn-hover disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full max-sm:justify-center"
            >
              {running ? "Analizuję…" : "Sprawdź działkę"}
              <Icon d={ICON.arrowRight} size={20} stroke={2.5} />
            </button>
            <span id="start-hint" className="max-w-[440px] text-[13px] text-muted">
              {!lookup
                ? "Najpierw wskaż działkę."
                : cropMissing
                  ? "Wybierz uprawę, żeby zacząć."
                  : !dateValid
                    ? "Popraw datę, żeby zacząć."
                  : "Tylko publiczne, bezpłatne dane: GUGiK, ARiMR, IUNG-PIB, Copernicus, USGS Landsat, Open-Meteo, IMGW-PIB, Wody Polskie."}
            </span>
          </div>
        </Card>

        <aside className="flex min-w-0 flex-[1_1_380px] flex-col gap-6 max-sm:gap-4">
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
