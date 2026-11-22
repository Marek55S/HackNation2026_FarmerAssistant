// Python backend (backend/, FastAPI) – the real analysis pipeline. Server-side only (route handlers, server components).

import type { CropId, LandCover, LngLat, ParcelLookup, ParcelPart, PartChoice, Report } from "./types";
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
  czesci?: BackendCzesc[];
  arimr_powod?: string | null;
}

interface BackendCzesc {
  id: string;
  uprawa: string | null;
  roslina: string | null;
  ha: number;
  udzial: number;
  geometria: { type: string; coordinates: LngLat[][][] } | null;
  zrodlo: string;
  pewne: boolean;
  reczna: boolean;
}

const OUT_OF_SCOPE: LandCover[] = ["las", "woda", "zabudowa", "drogi"];

function toPart(c: BackendCzesc): ParcelPart {
  return {
    id: c.id,
    crop: (c.uprawa as CropId) ?? null,
    areaHa: c.ha,
    share: c.udzial,
    plant: c.roslina,
    source: c.zrodlo,
    confirmed: c.pewne,
    manual: c.reczna,
    geometry: c.geometria?.coordinates ?? null,
  };
}

export function toLookup(b: BackendParcel): ParcelLookup | null {
  const d = b.dzialka;
  if (!b.ok || !d) return null;
  const outOfScope = OUT_OF_SCOPE.includes(d.pokrycie);
  return {
    parcel: {
      id: d.id,
      number: d.numer,
      gmina: d.gmina,
      obreb: d.obreb,
      wojewodztwo: d.wojewodztwo ?? "",
      areaHa: d.pow_ha,
      landUse: outOfScope ? d.pokrycie : "grunty rolne",
      landCover: d.pokrycie,
      geometry: d.geometria,
    },
    cropHint: b.podpowiedz ? { crop: b.podpowiedz.key as CropId, source: b.podpowiedz.zrodlo } : null,
    parts: (b.czesci ?? []).map(toPart),
    outOfScope,
  };
}

/**
 * Crop choice in the URL, so a report link rebuilds the same split: `cz=c1:kukurydza,c2:laka`.
 * A part the farmer added has no id and carries its area: `cz=:rzepak:1.4`.
 */
export function encodeParts(parts: PartChoice[]): string {
  return parts
    .filter((p) => p.crop)
    .map((p) => [p.id ?? "", p.crop, p.areaHa ? String(p.areaHa) : ""].join(":").replace(/:+$/, ""))
    .join(",");
}

export function decodeParts(raw: string | null): PartChoice[] {
  if (!raw) return [];
  const out: PartChoice[] = [];
  for (const s of raw.split(",").slice(0, 20)) {
    const [id, crop, ha] = s.split(":");
    if (crop) out.push({ ...(id ? { id } : {}), crop: crop as CropId, ...(Number(ha) > 0 ? { areaHa: Number(ha) } : {}) });
  }
  return out;
}

export function reportUrl(p: { dzialka: string; data: string; od?: string | null; uprawa?: string | null; czesci?: PartChoice[] }): string {
  const q = new URLSearchParams({ dzialka: p.dzialka, data: p.data });
  if (p.od) q.set("od", p.od);
  if (p.uprawa) q.set("uprawa", p.uprawa);
  const cz = p.czesci?.length ? encodeParts(p.czesci) : "";
  if (cz) q.set("cz", cz);
  return `/raport?${q}`;
}

export function reportTitle(r: { parcel: { number: string }; crop: { name: string } | null; date: string }): string {
  return `Działka ${r.parcel.number}${r.crop ? ` · ${r.crop.name.toLowerCase()}` : ""} · ${shortDate(r.date)}`;
}

/** Report from the backend (POST /api/raport); throws BackendError (404 parcel, 422 crop needed, 5xx). */
export async function fetchReport(p: {
  dzialka: string;
  data: string;
  od: string | null;
  uprawa: string | null;
  czesci?: PartChoice[];
}): Promise<Report> {
  const r = await backend<{ report: Report }>("/api/raport", {
    method: "POST",
    body: JSON.stringify({
      id: p.dzialka,
      data: p.data,
      od: p.od,
      uprawa: p.czesci?.length ? null : p.uprawa,
      czesci: p.czesci?.length ? p.czesci.map((c) => ({ id: c.id, uprawa: c.crop, ha: c.areaHa })) : undefined,
    }),
    timeoutMs: 120000,
  });
  return r.report;
}

