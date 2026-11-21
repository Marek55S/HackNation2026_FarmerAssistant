"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFarm } from "@/lib/farm";
import type { AnalyzeEvent, CropId, ParcelLookup, Report } from "@/lib/types";
import { MobileNav } from "../mobile-nav";
import { Card, ICON, Icon, Logo, StepNumber } from "../ui";
import { DatePicker } from "./date-picker";
import { ParcelPicker } from "./parcel-picker";
import { FarmPanel, ProgressPanel, type ProgressState } from "./side-panels";

const FARM_STATUS: Record<Report["status"]["tone"], string> = {
  susza: "Pilne",
  zagrozenie: "Do obserwacji",
  spokojnie: "W porządku",
  plan: "Zrób przed sezonem",
  "poza-zakresem": "Poza zakresem",
};

export function StartScreen({ today, initialParcelId, initialDate }: { today: string; initialParcelId: string; initialDate: string }) {
  const router = useRouter();
  const { farm, upsert, remove } = useFarm();
  const [lookup, setLookup] = useState<ParcelLookup | null>(null);
  const [crop, setCrop] = useState<CropId | null>(null);
  const [date, setDate] = useState(initialDate);
  const [status, setStatus] = useState<ProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const onLookup = useCallback((l: ParcelLookup | null) => {
    setLookup((prev) => {
      // Keep the farmer's crop choice when only the date changed for the same parcel.
      if (prev?.parcel.id !== l?.parcel.id) setCrop(null);
      return l;
    });
  }, []);

  const cropMissing = !!lookup && !lookup.outOfScope && !lookup.cropHint && !crop;
  const canStart = !!lookup && !cropMissing && !running;

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
        body: JSON.stringify({ dzialka: lookup.parcel.id, data: date, uprawa: crop ?? undefined }),
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
      setRunning(false);
    }
  }

  function addToFarm() {
    if (!lookup) return;
    const { parcel } = lookup;
    const q = new URLSearchParams({ dzialka: parcel.id, data: date });
    if (crop) q.set("uprawa", crop);
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
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-[1376px] flex-wrap items-center gap-4 px-8 py-3.5 max-sm:px-4">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div className="flex flex-col">
              <span className="text-[17px] font-extrabold tracking-tight">Asystent Wodny</span>
              <span className="text-xs text-muted">woda na Twojej działce — z danych publicznych</span>
            </div>
          </div>
          <nav className="ml-auto flex flex-wrap items-center gap-2 max-sm:hidden">
            <a href="#jak" className="rounded-[10px] px-3.5 py-2.5 text-sm font-medium text-ink-2 no-underline hover:bg-chip">
              Jak to działa
            </a>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint-2 px-3 py-2 text-xs font-semibold text-primary">
              <Icon d={ICON.lock} size={14} />
              Bez logowania · bez danych osobowych
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1376px] flex-wrap items-start gap-6 px-8 pb-12 pt-8 max-sm:gap-4 max-sm:px-4 max-sm:pt-4">
        <Card className="flex min-w-0 flex-[999_1_560px] flex-col gap-7 p-8 max-sm:gap-6 max-sm:p-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[32px] font-extrabold leading-tight tracking-tight max-sm:text-[26px]">Sprawdź wodę na swojej działce</h1>
            <p className="text-base text-ink-3">Podaj działkę i dzień. Glebę, teren i pogodę z 10 lat pobierzemy sami, uprawę podpowiemy z deklaracji ARiMR.</p>
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <StepNumber n={1} />
              <h2 className="text-[19px] font-bold">Wskaż działkę</h2>
            </div>
            <ParcelPicker initialId={initialParcelId} date={date} lookup={lookup} onLookup={onLookup} crop={crop} onCrop={setCrop} />
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5">
              <StepNumber n={2} />
              <h2 className="text-[19px] font-bold">Na jaki dzień?</h2>
            </div>
            <DatePicker value={date} today={today} onChange={setDate} />
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-rule-soft pt-4">
            <button
              onClick={start}
              disabled={!canStart}
              aria-describedby="start-hint"
              className="inline-flex min-h-14 items-center gap-2.5 rounded-[14px] bg-primary px-7 text-lg font-bold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50 max-sm:w-full max-sm:justify-center"
            >
              {running ? "Analizuję…" : "Sprawdź działkę"}
              <Icon d={ICON.arrowRight} size={20} stroke={2.5} />
            </button>
            <span id="start-hint" className="max-w-[440px] text-[13px] text-muted">
              {!lookup
                ? "Najpierw wskaż działkę."
                : cropMissing
                  ? "Wybierz uprawę, żeby zacząć."
                  : "Tylko publiczne, bezpłatne dane: GUGiK, ARiMR, IUNG-PIB, Copernicus, USGS Landsat, Open-Meteo, IMGW-PIB, Wody Polskie."}
            </span>
          </div>
        </Card>

        <aside className="flex min-w-0 flex-[1_1_380px] flex-col gap-6 max-sm:gap-4">
          <div ref={progressRef} className={running || status || error ? "scroll-mt-4" : "max-md:hidden"}>
            <ProgressPanel status={status} error={error} />
          </div>
          <FarmPanel farm={farm} onAdd={addToFarm} onRemove={remove} canAdd={!!lookup} />
          <Card className="flex flex-col gap-2 p-6 text-sm text-ink-3 max-sm:p-4">
            <h2 id="jak" className="scroll-mt-4 text-[17px] font-bold text-ink">
              Jak to działa
            </h2>
            <p>
              Łączymy bezpłatne dane publiczne: granice działki (GUGiK), uprawy (ARiMR), pogodę (ERA5-Land), glebę (IUNG-PIB), rzeźbę
              terenu i zdjęcia satelitarne. Liczymy bilans wody w glebie i porównujemy go z progami suszy IUNG.
            </p>
            <p>
              Pogoda z poprzednich sezonów to scenariusze na najbliższe tygodnie i kolejny sezon. W raporcie zobaczysz na mapie, co zrobić
              i gdzie: najpierw zatrzymanie wody, potem zabiegi na polu, na końcu nawadnianie.
            </p>
          </Card>
        </aside>
      </main>

      <MobileNav active="dzialki" reportHref={farm.find((f) => f.tone)?.url ?? null} />
    </div>
  );
}
