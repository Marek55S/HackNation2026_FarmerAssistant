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

/** April–September = growing season with IUNG drought thresholds. */
export function seasonOf(iso: string): Season {
  const { m } = parseIso(iso);
  return m >= 4 && m <= 9 ? "sezon" : "poza-sezonem";
}

/** Last season that has (at least partly) happened by the analysis date. */
export function lastSeason(iso: string): number {
  const { y, m } = parseIso(iso);
  return m >= 4 ? y : y - 1;
}

export interface YearSource {
  year: number;
  sensor: "s2" | "mixed" | "landsat";
  tip: string;
}

/** The 10 seasons we compare against and which satellite covers each (Sentinel-2 over Poland from 2017). */
export function historyWindow(iso: string) {
  const { y, m, d } = parseIso(iso);
  const last = lastSeason(iso);
  const years: YearSource[] = [];
  for (let yr = last - 9; yr <= last; yr++) {
    if (yr >= 2017) years.push({ year: yr, sensor: "s2", tip: "Sentinel-2" });
    else if (yr === 2016) years.push({ year: yr, sensor: "mixed", tip: "Sentinel-2 (CDSE) + Landsat 8" });
    else
      years.push({
        year: yr,
        sensor: "landsat",
        tip: yr >= 2013 ? "Landsat 8" : yr === 2012 ? "Landsat 7 (pasy bez danych)" : "Landsat 5 / 7",
      });
  }
  const s2From = Math.max(2017, last - 9);
  const satSrc =
    last - 9 >= 2017
      ? `Sentinel-2 ${s2From}–${last}`
      : last >= 2017
        ? `Sentinel-2 ${s2From}–${last} + Landsat ${last - 9}–${Math.min(2016, last)}`
        : `Landsat ${last - 9}–${last}`;
  return {
    from: `${pad(d)}.${pad(m)}.${y - 10}`,
    to: `${pad(d)}.${pad(m)}.${y}`,
    firstYear: last - 9,
    lastYear: last,
    years,
    hasOldImagery: last - 9 < 2017,
    satSrc,
  };
}
