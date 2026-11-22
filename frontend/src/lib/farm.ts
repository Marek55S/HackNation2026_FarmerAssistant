"use client";

// "Twoje gospodarstwo": parcels the farmer checked, kept only in this browser (no account, no personal data).

import { useCallback, useSyncExternalStore } from "react";
import { addDays, isValidIso, periodDays } from "./dates";
import type { Report, StatusTone } from "./types";

export interface FarmParcel {
  parcelId: string;
  name: string;
  meta: string;
  status: string;
  /** Status of the last report; null = added but not checked yet */
  tone: StatusTone | null;
  /** Last report URL for this parcel */
  url: string;
  checkedAt: string;
  /** Analysis date of the stored report (yyyy-mm-dd); missing in entries saved before it existed */
  date?: string;
  /** Simplified parcel outline (lon, lat) for the thumbnail */
  shape?: [number, number][];
}

const FARM_STATUS: Record<StatusTone, string> = {
  susza: "Pilne",
  zagrozenie: "Do obserwacji",
  spokojnie: "W porządku",
  plan: "Zrób przed sezonem",
  "poza-zakresem": "Poza zakresem",
};

/** At most ~40 points: enough for a 40 px thumbnail, small enough for localStorage. */
export function thumbShape(ring: [number, number][]): [number, number][] {
  const step = Math.max(1, Math.ceil(ring.length / 40));
  return ring.filter((_, i) => i % step === 0);
}

/** The farm entry for a computed report (same on the start screen and when a report is opened). */
export function farmEntry(report: Report, url: string): FarmParcel {
  const p = report.parcel;
  return {
    parcelId: p.id,
    name: `${p.number}${report.crop ? ` · ${report.crop.name.toLowerCase()}` : ""}`,
    meta: `${p.areaHa.toLocaleString("pl-PL")} ha · ${report.urgent ? report.urgent.title.toLowerCase() : report.status.label.toLowerCase()}`,
    status: FARM_STATUS[report.status.tone],
    tone: report.status.tone,
    url,
    checkedAt: new Date().toISOString(),
    date: report.date,
    shape: thumbShape(p.geometry),
  };
}

/** Analysis date stored in a report URL (?data=…). */
export function reportDate(url: string): string | null {
  const d = new URL(url, "http://x").searchParams.get("data");
  return isValidIso(d) ? d : null;
}

/** The same report recomputed for `today`, keeping the crop and the length of the data period. */
export function recheckUrl(url: string, today: string): string {
  const u = new URL(url, "http://x");
  const q = u.searchParams;
  const d = q.get("data");
  const od = q.get("od");
  q.set("data", today);
  if (od && isValidIso(od) && isValidIso(d)) q.set("od", addDays(today, -(periodDays(od, d) - 1)));
  return `${u.pathname}?${q}`;
}

/** "dziś", "wczoraj", "3 dni temu" — when the farmer last looked at it. */
export function checkedAgo(iso: string, now = new Date()): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const n = Math.round((day(now) - day(t)) / 86400000);
  return n <= 0 ? "sprawdzono dziś" : n === 1 ? "sprawdzono wczoraj" : `sprawdzono ${n} dni temu`;
}

const KEY = "asystent-wodny:farm:v2";

/** Set right before opening a report the start screen has just computed (sessionStorage, ms timestamp). */
export const OPENING_KEY = "asystent-wodny:otwieram-raport";

/** True when the report being loaded was computed on the start screen a moment ago. */
export function justAnalysed(): boolean {
  try {
    const t = Number(sessionStorage.getItem(OPENING_KEY));
    return !!t && Date.now() - t < 120_000;
  } catch {
    return false;
  }
}

const EMPTY: FarmParcel[] = [];

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: FarmParcel[] } | null = null;

function read(): FarmParcel[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // storage blocked (private mode) — empty list
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = EMPTY;
  if (raw) {
    try {
      value = JSON.parse(raw) as FarmParcel[];
    } catch {
      value = EMPTY;
    }
  }
  cache = { raw, value };
  return value;
}

function write(list: FarmParcel[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFarm() {
  const farm = useSyncExternalStore(subscribe, read, () => EMPTY);
  const upsert = useCallback((p: FarmParcel) => {
    const list = read().filter((x) => x.parcelId !== p.parcelId);
    write([p, ...list].slice(0, 20));
  }, []);
  const remove = useCallback((parcelId: string) => {
    write(read().filter((x) => x.parcelId !== parcelId));
  }, []);
  return { farm, upsert, remove };
}
