// Map vocabulary shared by the report (no MapLibre import, so it stays out of the server bundle).

import type { CSSProperties } from "react";
import type { ActionCategory, MapLayer } from "@/lib/types";

export const LAYERS: Record<MapLayer, string> = {
  plan: "Plan działań",
  sucho: "Gdzie sucho",
  teren: "Teren i spływ",
  gleba: "Gleba",
};

/** color = pin fill (on the map), ink = text colour on the page (theme-aware), bg = selected card background. */
export const CAT: Record<ActionCategory, { name: string; color: string; ink: string; bg: string }> = {
  ret: { name: "1 · Zatrzymaj wodę", color: "#1E5B3A", ink: "var(--cat-ret-ink)", bg: "var(--cat-ret-bg)" },
  agro: { name: "2 · Na polu", color: "#7A4E14", ink: "var(--cat-agro-ink)", bg: "var(--cat-agro-bg)" },
  irr: { name: "3 · Nawadnianie", color: "#1f6fc9", ink: "var(--cat-irr-ink)", bg: "var(--cat-irr-bg)" },
};

/**
 * Raster overlay colours per class index (RasterGrid.values), as RGBA.
 * Drawn translucent and smoothed over the photo; "as usual" is fully transparent so only deviations show.
 */
export const RASTER_RGBA: Record<Exclude<MapLayer, "plan">, [number, number, number, number][]> = {
  // 0 wetter · 1 as usual · 2 a bit drier · 3 drier · 4 much drier
  sucho: [
    [70, 150, 235, 0.55],
    [0, 0, 0, 0],
    [246, 196, 120, 0.5],
    [226, 120, 80, 0.62],
    [190, 55, 45, 0.72],
  ],
  // 0 highest … 4 lowest — low ground in blue, where water gathers
  teren: [
    [250, 236, 196, 0.5],
    [235, 222, 190, 0.32],
    [0, 0, 0, 0],
    [120, 170, 215, 0.38],
    [45, 110, 190, 0.58],
  ],
  // 0 clay · 1 loamy sand · 2 sand
  gleba: [
    [110, 80, 50, 0.55],
    [196, 156, 92, 0.45],
    [246, 228, 170, 0.55],
  ],
};

const rgba = ([r, g, b, a]: [number, number, number, number]) => `rgba(${r}, ${g}, ${b}, ${Math.max(a, 0.35)})`;

const sw = (c: string): CSSProperties => ({ width: 14, height: 14, borderRadius: 3, background: c });

export const LEGEND: Record<MapLayer, { style: CSSProperties; t: string }[]> = {
  plan: [
    { style: sw("#1E5B3A"), t: "zatrzymaj wodę" },
    { style: sw("#7A4E14"), t: "na polu" },
    { style: sw("#1f6fc9"), t: "nawadnianie" },
    { style: { width: 16, height: 0, borderTop: "3px solid #F2C14E" }, t: "granica działki" },
    { style: { ...sw("#FFFFFF"), border: "2px solid #1A1C19", boxSizing: "border-box" }, t: "zaznaczone działanie" },
  ],
  sucho: [
    { style: sw(rgba(RASTER_RGBA.sucho[4])), t: "dużo suszej niż zwykle" },
    { style: sw(rgba(RASTER_RGBA.sucho[2])), t: "trochę suszej" },
    { style: { ...sw("transparent"), border: "1px dashed #9aa39a", boxSizing: "border-box" }, t: "jak zwykle (bez koloru)" },
    { style: sw(rgba(RASTER_RGBA.sucho[0])), t: "wilgotniej" },
  ],
  teren: [
    { style: sw(rgba(RASTER_RGBA.teren[0])), t: "wyżej" },
    { style: sw(rgba(RASTER_RGBA.teren[4])), t: "niżej — tu zbiera się woda" },
    { style: { width: 18, height: 0, borderTop: "3px solid #123f78" }, t: "kierunek spływu" },
    { style: { width: 14, height: 10, borderRadius: "50%", border: "2px dashed #123f78" }, t: "zagłębienie" },
  ],
  gleba: [
    { style: sw(rgba(RASTER_RGBA.gleba[0])), t: "glina — trzyma wodę" },
    { style: sw(rgba(RASTER_RGBA.gleba[1])), t: "piasek gliniasty" },
    { style: sw(rgba(RASTER_RGBA.gleba[2])), t: "piasek — przepuszcza" },
  ],
};
