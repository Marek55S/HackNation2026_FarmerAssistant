// Progress shown while the backend computes the report (NDJSON stream of POST /api/analyze).
// The backend answers in one go, so the steps advance on typical timings (TEST_API.md) and finish when the report arrives.

import { historyWindow } from "./dates";
import type { AnalysisStep } from "./types";

interface StepDef {
  label: string;
  src: string;
  seconds: number;
}

export function stepDefs(date: string, isToday: boolean): StepDef[] {
  const y = Number(date.slice(0, 4));
  const win = historyWindow(date);
  return [
    { label: "Granice działki i uprawy", src: "ULDK GUGiK · deklaracje ARiMR · mapa upraw Copernicus", seconds: 0.8 },
    { label: `Pogoda ${y - 11}–${y}`, src: "Open-Meteo ERA5-Land · opad, parowanie, wilgotność gleby", seconds: 0.8 },
    { label: "Gleba i pokrycie terenu", src: "kategoria podatności IUNG-PIB + SoilGrids", seconds: 0.6 },
    { label: "Rzeźba terenu", src: "NMT GUGiK 1 m (z pamięci) albo Copernicus DEM 30 m", seconds: 0.6 },
    { label: "Rowy, cieki i zbiorniki", src: "BDOT10k (paczka powiatu)", seconds: 0.6 },
    { label: "Zdjęcia satelitarne", src: `${win.satSrc} · Sentinel Hub / Planetary Computer`, seconds: 2.0 },
    { label: "Tło suszy w Europie", src: "EDO · Combined Drought Indicator", seconds: 0.4 },
    isToday
      ? { label: "Prognoza 16 dni", src: "Open-Meteo", seconds: 0.3 }
      : { label: "Pogoda po tamtym dniu", src: "średnia z 10 lat (prognozy z tamtego dnia nie da się odtworzyć)", seconds: 0.2 },
    { label: "Bilans wodny vs progi suszy IUNG", src: "FAO-56 · KBW 60 dni · scenariusze z poprzednich sezonów", seconds: 0.6 },
    { label: "Przyczyny i zalecenia", src: "retencja → pole → nawadnianie", seconds: 0.4 },
  ];
}

/** Steps at `elapsed` seconds; with `finished` every step is done. Never reports 100% before the backend answers. */
export function stepsAt(defs: StepDef[], elapsed: number, finished = false): { steps: AnalysisStep[]; progress: number } {
  const total = defs.reduce((a, d) => a + d.seconds, 0);
  let acc = 0;
  const steps: AnalysisStep[] = defs.map((d, i) => {
    const start = acc;
    acc += d.seconds;
    const last = i === defs.length - 1;
    if (finished || (elapsed >= acc && !last)) return { label: d.label, src: d.src, state: "done", seconds: d.seconds };
    if (elapsed >= start) return { label: d.label, src: d.src, state: "running", seconds: null };
    return { label: d.label, src: d.src, state: "wait", seconds: null };
  });
  return { steps, progress: finished ? 100 : Math.min(95, Math.round((elapsed / total) * 100)) };
}
