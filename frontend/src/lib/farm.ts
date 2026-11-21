"use client";

// "Twoje gospodarstwo": parcels the farmer checked, kept only in this browser (no account, no personal data).

import { useCallback, useSyncExternalStore } from "react";

export type FarmTone = "danger" | "warn" | "ok";

export interface FarmParcel {
  parcelId: string;
  name: string;
  meta: string;
  status: string;
  tone: FarmTone;
  /** Last report URL for this parcel */
  url: string;
  checkedAt: string;
}

const KEY = "asystent-wodny:farm";

// Shown until the user checks their own parcels, as in the mockup.
const DEMO: FarmParcel[] = [
  { parcelId: "040410_2.0012.245/3", name: "245/3 · kukurydza", meta: "4,8 ha · susza w sezonie · 2 działania na jesień", status: "Zrób przed zimą", tone: "danger", url: "/raport?dzialka=040410_2.0012.245%2F3", checkedAt: "" },
  { parcelId: "040410_2.0012.118", name: "118 · pszenica ozima", meta: "6,1 ha · susza wiosną w 3 z 10 lat", status: "Do zaplanowania", tone: "warn", url: "/raport?dzialka=040410_2.0012.118&uprawa=pszenica", checkedAt: "" },
  { parcelId: "040410_2.0012.119/2", name: "119/2 · łąka", meta: "2,3 ha · gleba organiczna, nie odwadniać", status: "W porządku", tone: "ok", url: "/raport?dzialka=040410_2.0012.119%2F2&uprawa=laka", checkedAt: "" },
];

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: FarmParcel[] } | null = null;

function read(): FarmParcel[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // storage blocked (private mode) — fall back to demo list
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = DEMO;
  if (raw) {
    try {
      value = JSON.parse(raw) as FarmParcel[];
    } catch {
      value = DEMO;
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
  const farm = useSyncExternalStore(subscribe, read, () => DEMO);
  const upsert = useCallback((p: FarmParcel) => {
    const list = read().filter((x) => x.parcelId !== p.parcelId);
    write([p, ...list].slice(0, 20));
  }, []);
  const remove = useCallback((parcelId: string) => {
    write(read().filter((x) => x.parcelId !== parcelId));
  }, []);
  return { farm, upsert, remove };
}
