import type { Season } from "./types";

/** Earliest analysis date: 10 years of satellite + weather history must be available before it. */
export const MIN_DATE = "2016-11-21";

const MONTHS = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

const pad = (n: number) => String(n).padStart(2, "0");

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function isValidIso(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const { y, m, d } = parseIso(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function shortDate(iso: string): string {
  const { y, m, d } = parseIso(iso);
  return `${pad(d)}.${pad(m)}.${y}`;
}

export function longDate(iso: string): string {
  const { y, m, d } = parseIso(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

const md = (iso: string) => iso.slice(5); // "mm-dd"

/** F13: growing season with IUNG drought thresholds is 21.III–30.IX (pipeline_plan.md §7). */
export function seasonOf(iso: string): Season {
  const m = md(iso);
  return m >= "03-21" && m <= "09-30" ? "sezon" : "poza-sezonem";
}

/** 21.III–20.V: no full 60-day KBW period yet → incomplete period, lower confidence. */
export function isEarlySeason(iso: string): boolean {
  const m = md(iso);
  return m >= "03-21" && m <= "05-20";
}

/** Last season that has (at least partly) happened by the analysis date. */
export function lastSeason(iso: string): number {
  const { y } = parseIso(iso);
  return md(iso) >= "03-21" ? y : y - 1;
}

export interface YearSource {
  year: number;
  sensor: "s2" | "landsat";
  tip: string;
}

/**
 * The 10 seasons we compare against and which satellite covers each:
 * Sentinel-2 L2A from Planetary Computer over Poland from 2016, Landsat C2 L2 (30 m) for 2006–2015 (ZRODLA_DANYCH.md).
 */
export function historyWindow(iso: string) {
  const { y, m, d } = parseIso(iso);
  const last = lastSeason(iso);
  const years: YearSource[] = [];
  for (let yr = last - 9; yr <= last; yr++) {
    if (yr >= 2016) years.push({ year: yr, sensor: "s2", tip: "Sentinel-2 · 10 m" });
    else
      years.push({
        year: yr,
        sensor: "landsat",
        tip: yr >= 2013 ? "Landsat 8 · 30 m" : yr === 2012 ? "Landsat 7 · 30 m (pasy bez danych)" : "Landsat 5 / 7 · 30 m",
      });
  }
  const s2From = Math.max(2016, last - 9);
  const satSrc =
    last - 9 >= 2016
      ? `Sentinel-2 ${s2From}–${last}`
      : `Sentinel-2 ${s2From}–${last} + Landsat ${last - 9}–2015`;
  return {
    from: `${pad(d)}.${pad(m)}.${y - 10}`,
    to: `${pad(d)}.${pad(m)}.${y}`,
    firstYear: last - 9,
    lastYear: last,
    years,
    hasOldImagery: last - 9 < 2016,
    satSrc,
  };
}
