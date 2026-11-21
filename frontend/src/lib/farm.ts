"use client";

// "Twoje gospodarstwo": parcels the farmer checked, kept only in this browser (no account, no personal data).

import { useCallback, useSyncExternalStore } from "react";
import type { StatusTone } from "./types";

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
}

const KEY = "asystent-wodny:farm:v2";

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
