// Simulated analysis progress. Stateless: the job id encodes its parameters and start time,
// so it works across Cloud Run instances without a database.

import { historyWindow } from "../dates";
import type { AnalysisStatus, AnalysisStep } from "../types";

export interface AnalysisParams {
  parcelId: string;
  date: string;
  crop?: string;
}

interface Job extends AnalysisParams {
  t: number;
}

export function createJobId(p: AnalysisParams): string {
  const job: Job = { ...p, t: Date.now() };
  return Buffer.from(JSON.stringify(job)).toString("base64url");
}

export function decodeJobId(id: string): Job | null {
  try {
    const job = JSON.parse(Buffer.from(id, "base64url").toString("utf8")) as Job;
    if (typeof job.t !== "number" || typeof job.date !== "string" || typeof job.parcelId !== "string") return null;
    return job;
  } catch {
    return null;
  }
}

export function reportUrl(p: AnalysisParams): string {
  const q = new URLSearchParams({ dzialka: p.parcelId, data: p.date });
  if (p.crop) q.set("uprawa", p.crop);
  return `/raport?${q.toString()}`;
}

export function jobStatus(id: string, job: Job, now = Date.now()): AnalysisStatus {
  const y = Number(job.date.slice(0, 4));
  const win = historyWindow(job.date);
  const defs: [string, string, number][] = [
    ["Granice działki i uprawy z lat ubiegłych", "ULDK GUGiK · deklaracje ARiMR (GSA) · mapa upraw Copernicus", 0.5],
    [`Pogoda ${y - 10}–${y}`, "Open-Meteo ERA5-Land · opad, parowanie, wilgotność gleby", 0.7],
    ["Gleba", "kategoria podatności IUNG-PIB + SoilGrids", 0.5],
    ["Rzeźba terenu", "NMT GUGiK 1 m · spadki, zagłębienia, spływ", 0.8],
    ["Rowy, cieki i zbiorniki", "BDOT10k · IMGW (stany rzek)", 0.4],
    ["Zdjęcia satelitarne – 10 sezonów", win.satSrc, 1.4],
    ["Tło suszy w Europie", "EDO Copernicus · CDI, SPI", 0.4],
    ["Bilans wodny vs progi suszy IUNG", "dla upraw z każdego roku", 0.4],
    ["Przyczyny i działania", "retencja → pole → nawadnianie", 0.3],
  ];
  const total = defs.reduce((a, d) => a + d[2], 0);
  const elapsed = Math.max(0, (now - job.t) / 1000);
  let acc = 0;
  const steps: AnalysisStep[] = defs.map(([label, src, dur]) => {
    const start = acc;
    acc += dur;
    if (elapsed >= acc) return { label, src, state: "done", seconds: dur };
    if (elapsed >= start) return { label, src, state: "running", seconds: null };
    return { label, src, state: "wait", seconds: null };
  });
  const done = elapsed >= total;
  return {
    id,
    elapsed: Math.min(elapsed, total),
    progress: Math.min(100, Math.round((elapsed / total) * 100)),
    done,
    steps,
    reportUrl: reportUrl(job),
  };
}
