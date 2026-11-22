// Python backend (backend/, FastAPI) – the real analysis pipeline. Server-side only (route handlers, server components).

import type { CropId, LandCover, ParcelLookup, Report } from "./types";
import { shortDate } from "./dates";

export const BACKEND_URL = (process.env.BACKEND_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function backend<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(init?.timeoutMs ?? 60000),
      cache: "no-store",
    });
  } catch (e) {
    throw new BackendError(`Serwer analizy nie odpowiada (${(e as Error).name}).`, 503);
  }
  const data = (await r.json().catch(() => ({}))) as T & { error?: string; detail?: unknown };
  if (!r.ok) {
    const msg = typeof data.error === "string" ? data.error : typeof data.detail === "string" ? data.detail : `Błąd serwera analizy (${r.status})`;
    throw new BackendError(msg, r.status);
  }
  return data;
}

/** Backend /api/dzialka response. */
export interface BackendParcel {
  ok: boolean;
  powod?: string;
  dzialka?: {
    id: string;
    numer: string;
    gmina: string;
    obreb: string;
    wojewodztwo: string | null;
    pow_ha: number;
    geometria: [number, number][];
    pokrycie: LandCover;
  };
  podpowiedz?: { key: string; zrodlo: string } | null;
  arimr_powod?: string | null;
}

const OUT_OF_SCOPE: LandCover[] = ["las", "woda", "zabudowa", "drogi"];

export function toLookup(b: BackendParcel): ParcelLookup | null {
  const d = b.dzialka;
  if (!b.ok || !d) return null;
  return {
    parcel: {
      id: d.id,
      number: d.numer,
      gmina: d.gmina,
      obreb: d.obreb,
      wojewodztwo: d.wojewodztwo ?? "",
      areaHa: d.pow_ha,
      landUse: OUT_OF_SCOPE.includes(d.pokrycie) ? d.pokrycie : "grunty rolne",
      landCover: d.pokrycie,
      geometry: d.geometria,
    },
    cropHint: b.podpowiedz ? { crop: b.podpowiedz.key as CropId, source: b.podpowiedz.zrodlo } : null,
    outOfScope: OUT_OF_SCOPE.includes(d.pokrycie),
  };
}

export function reportUrl(p: { dzialka: string; data: string; od?: string | null; uprawa?: string | null }): string {
  const q = new URLSearchParams({ dzialka: p.dzialka, data: p.data });
  if (p.od) q.set("od", p.od);
  if (p.uprawa) q.set("uprawa", p.uprawa);
  return `/raport?${q}`;
}

export function reportTitle(r: { parcel: { number: string }; crop: { name: string } | null; date: string }): string {
  return `Działka ${r.parcel.number}${r.crop ? ` · ${r.crop.name.toLowerCase()}` : ""} · ${shortDate(r.date)}`;
}

/** Report from the backend (POST /api/raport); throws BackendError (404 parcel, 422 crop needed, 5xx). */
export async function fetchReport(p: { dzialka: string; data: string; od: string | null; uprawa: string | null }): Promise<Report> {
  if (process.env.MOCK_API === "1") return (await import("./mock")).mockReport(p); // MOCK_API: usunąć przed pushem
  const r = await backend<{ report: Report }>("/api/raport", {
    method: "POST",
    body: JSON.stringify({ id: p.dzialka, data: p.data, od: p.od, uprawa: p.uprawa }),
    timeoutMs: 90000,
  });
  return r.report;
}

