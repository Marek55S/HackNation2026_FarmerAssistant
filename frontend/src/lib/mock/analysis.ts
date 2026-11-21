// Simulated analysis progress for POST /api/analyze (NDJSON stream). Timings are illustrative,
// based on TEST_API.md; the real backend reports its own steps in the same shape.

import { historyWindow } from "../dates";
import type { AnalysisStep } from "../types";

interface StepDef {
  label: string;
  src: string;
  seconds: number;
  error?: string;
}

export function stepDefs(date: string, isToday: boolean): StepDef[] {
  const y = Number(date.slice(0, 4));
  const win = historyWindow(date);
  return [
    { label: "Granice działki i uprawy", src: "ULDK GUGiK · deklaracje ARiMR (GSA) · mapa upraw JRC", seconds: 0.4 },
    { label: `Pogoda ${y - 30}–${y}`, src: "Open-Meteo ERA5-Land · opad, parowanie, wilgotność gleby", seconds: 0.6 },
    { label: "Gleba i pokrycie terenu", src: "kategoria podatności IUNG-PIB + SoilGrids", seconds: 0.5 },
    { label: "Rzeźba terenu", src: "Copernicus DEM 30 m · spadki, zagłębienia, spływ", seconds: 0.4 },
    {
      label: "Dokładny model terenu 1 m",
      src: "NMT GUGiK",
      seconds: 0.6,
      error: "odpowiada 1–2 min — liczy się w tle, raport używa Copernicus DEM 30 m",
    },
    { label: "Rowy, cieki i zbiorniki", src: "BDOT10k (paczka powiatu)", seconds: 0.4 },
    { label: "Zdjęcia satelitarne – 10 sezonów", src: `${win.satSrc} · Planetary Computer`, seconds: 1.3 },
    isToday
      ? { label: "Prognoza 7 dni", src: "Open-Meteo", seconds: 0.3 }
      : { label: "Prognoza z tamtego dnia", src: "Open-Meteo", seconds: 0.2, error: "niedostępna dla dat archiwalnych — średnia z 10 lat" },
    { label: "Bilans wodny vs progi suszy IUNG", src: "FAO-56 · KBW 60 dni · scenariusze z poprzednich sezonów", seconds: 0.5 },
    { label: "Przyczyny i zalecenia", src: "retencja → pole → nawadnianie", seconds: 0.3 },
  ];
}

export function stepsAt(defs: StepDef[], elapsed: number): { steps: AnalysisStep[]; progress: number; done: boolean } {
  const total = defs.reduce((a, d) => a + d.seconds, 0);
  let acc = 0;
  const steps: AnalysisStep[] = defs.map((d) => {
    const start = acc;
    acc += d.seconds;
    if (elapsed >= acc)
      return d.error
        ? { label: d.label, src: d.src, state: "failed", seconds: d.seconds, error: d.error }
        : { label: d.label, src: d.src, state: "done", seconds: d.seconds };
    if (elapsed >= start) return { label: d.label, src: d.src, state: "running", seconds: null };
    return { label: d.label, src: d.src, state: "wait", seconds: null };
  });
  return { steps, progress: Math.min(100, Math.round((elapsed / total) * 100)), done: elapsed >= total };
}
