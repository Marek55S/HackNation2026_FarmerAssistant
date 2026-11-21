// Map vocabulary shared by the report (no MapLibre import, so it stays out of the server bundle).

import type { CSSProperties } from "react";
import type { ActionCategory, MapLayer } from "@/lib/types";

export const LAYERS: Record<MapLayer, string> = {
  plan: "Plan działań",
  sucho: "Gdzie sucho",
  teren: "Teren i spływ",
  gleba: "Gleba",
};

export const CAT: Record<ActionCategory, { name: string; color: string; bg: string }> = {
  ret: { name: "1 · Zatrzymaj wodę", color: "#1E5B3A", bg: "#EEF5EF" },
  agro: { name: "2 · Na polu", color: "#7A4E14", bg: "#F7EFE3" },
  irr: { name: "3 · Nawadnianie", color: "#1f6fc9", bg: "#E9F1FC" },
};

/** Colour per raster class index (RasterGrid.values). */
export const RASTER_COLORS: Record<Exclude<MapLayer, "plan">, string[]> = {
  // 0 wetter · 1 as usual · 2 a bit drier · 3 drier · 4 much drier
  sucho: ["#9ec5f4", "#f0efec", "#eea69b", "#d9625a", "#b8322f"],
  // 0 highest … 4 lowest
  teren: ["#A8864F", "#C2A36F", "#D6BE93", "#E6D5B8", "#F3EBDD"],
  // 0 clay · 1 loamy sand · 2 sand
  gleba: ["#8C6D4F", "#C9A46B", "#EAD9A8"],
};

const sw = (c: string): CSSProperties => ({ width: 14, height: 14, borderRadius: 3, background: c });

export const LEGEND: Record<MapLayer, { style: CSSProperties; t: string }[]> = {
  plan: [
    { style: sw("#1E5B3A"), t: "zatrzymaj wodę" },
    { style: sw("#7A4E14"), t: "na polu" },
    { style: sw("#1f6fc9"), t: "nawadnianie" },
    { style: sw("#F2B53A"), t: "zaznaczone działanie" },
  ],
  sucho: [
    { style: sw("#b8322f"), t: "dużo suszej niż zwykle" },
    { style: sw("#eea69b"), t: "trochę suszej" },
    { style: sw("#f0efec"), t: "jak zwykle" },
    { style: sw("#9ec5f4"), t: "wilgotniej" },
  ],
  teren: [
    { style: sw("#A8864F"), t: "wyżej" },
    { style: sw("#F3EBDD"), t: "niżej" },
    { style: { width: 18, height: 0, borderTop: "3px solid #123f78" }, t: "kierunek spływu" },
    { style: { width: 14, height: 10, borderRadius: "50%", border: "2px dashed #123f78" }, t: "zagłębienie" },
  ],
  gleba: [
    { style: sw("#8C6D4F"), t: "glina — trzyma wodę" },
    { style: sw("#C9A46B"), t: "piasek gliniasty" },
    { style: { ...sw("#EAD9A8"), border: "1px solid #C9B07A", boxSizing: "border-box" }, t: "piasek — przepuszcza" },
  ],
};
