"use client";

// Schematic parcel map from the mockup: SVG base + raster-like layer grids + numbered action pins.
// The real version will draw the ULDK geometry and rasters from the pipeline.

import { useMemo, type CSSProperties } from "react";
import type { ActionCategory, MapLayer, Zalecenie } from "@/lib/types";

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

const FIELD = "19.9,33.1 175.7,15.5 268.1,26.1 260.2,173.9 117.6,184.5 27.8,163.4";
const CLIP = "polygon(3% 12%, 62% 2%, 97% 8%, 94% 92%, 40% 98%, 6% 86%)";
const DITCH = "M150 3 C 220 6, 276 8, 288 46 L 296 200";
const IRR_ZONE = "186,70 265.6,64 260.2,173.9 184,180";

type Grid = string[];

function grid(cols: number, rows: number, fn: (u: number, v: number) => string): Grid {
  const out: Grid = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out.push(fn(i / (cols - 1), j / (rows - 1)));
  return out;
}

const dryVal = (u: number, v: number) =>
  1.15 * (-0.4 - 1.7 * u + 2.6 * Math.exp(-(((u - 0.88) / 0.12) ** 2 + ((v - 0.16) / 0.14) ** 2))) + 0.22 * Math.sin(u * 26 + v * 32);
const dryCol = (a: number) => (a <= -2 ? "#b8322f" : a <= -1.25 ? "#d9625a" : a <= -0.5 ? "#eea69b" : a < 0.6 ? "#f0efec" : "#9ec5f4");

export function dryGrid(cols = 24, rows = 16) {
  return grid(cols, rows, (u, v) => dryCol(dryVal(u, v)));
}

function terrainGrid() {
  return grid(24, 16, (u, v) => {
    const t = ((u - 0.05) * 0.85 + (v - 0.9) * -0.8) / (0.85 * 0.85 + 0.8 * 0.8);
    const e = 112 - 6.5 * t + 0.6 * Math.sin(u * 9) * Math.cos(v * 7) - 1.5 * Math.exp(-(((u - 0.88) / 0.1) ** 2 + ((v - 0.15) / 0.12) ** 2));
    return e > 111 ? "#A8864F" : e > 109.5 ? "#C2A36F" : e > 108 ? "#D6BE93" : e > 106.6 ? "#E6D5B8" : "#F3EBDD";
  });
}

function soilGrid() {
  return grid(24, 16, (u, v) => (u < 0.35 + 0.06 * Math.sin(v * 7) ? "#8C6D4F" : u < 0.68 + 0.05 * Math.cos(v * 9) ? "#C9A46B" : "#EAD9A8"));
}

export function GridLayer({ cells, cols, rows }: { cells: Grid; cols: number; rows: number }) {
  return (
    <div
      className="absolute"
      style={{
        left: "4%",
        top: "6%",
        width: "88%",
        height: "88%",
        clipPath: CLIP,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      }}
    >
      {cells.map((c, i) => (
        <span key={i} style={{ background: c }} />
      ))}
    </div>
  );
}

const Label = ({ x, y, w, text, fill = "#1A1C19" }: { x: number; y: number; w: number; text: string; fill?: string }) => (
  <>
    <rect x={x} y={y} width={w} height="16" rx="4" fill="#FFFFFF" fillOpacity="0.92" />
    <text x={x + w / 2} y={y + 11} textAnchor="middle" fontSize="9" fontWeight="700" fill={fill}>
      {text}
    </text>
  </>
);

export function ParcelMap({
  actions,
  layer,
  pin,
  onPin,
}: {
  actions: Zalecenie[];
  layer: MapLayer;
  pin: number;
  onPin: (a: Zalecenie) => void;
}) {
  const grids = useMemo(() => ({ sucho: dryGrid(), teren: terrainGrid(), gleba: soilGrid() }), []);
  const sel = actions.find((a) => a.n === pin);
  const rule = sel?.regula;
  const trees = Array.from({ length: 8 }, (_, k) => ({ x: 256.5 - k * 0.8, y: 44 + k * 16 }));

  return (
    <div className="relative aspect-[3/2] w-full overflow-hidden rounded-[14px] bg-[#DDE7D5]">
      <svg viewBox="0 0 300 200" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <pattern id="rzedy" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
            <rect width="6" height="6" fill="#CFE3B9" />
            <rect width="3" height="6" fill="#C3DAAB" />
          </pattern>
        </defs>
        <path d="M0 60 L300 40 M0 150 L300 190 M90 0 L70 200 M210 0 L230 200" stroke="#C7D5BD" strokeWidth="2" fill="none" />
        <path d="M0 196 L300 186" stroke="#D8D2C2" strokeWidth="7" />
        <text x="40" y="196" fontSize="8" fill="#5F625B">
          droga dojazdowa
        </text>
        <polygon points={FIELD} fill="url(#rzedy)" />
      </svg>

      {layer !== "plan" && <GridLayer cells={grids[layer]} cols={24} rows={16} />}

      <svg
        viewBox="0 0 300 200"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={`Mapa działki, widok: ${LAYERS[layer]}. Zaznaczone działanie: ${sel?.n}. ${sel?.co}`}
      >
        {layer === "plan" && (
          <>
            <polygon points={IRR_ZONE} fill="#2a78d6" fillOpacity="0.2" stroke="#1f6fc9" strokeWidth="1.5" strokeDasharray="5 4" />
            <ellipse cx="236" cy="45" rx="20" ry="11" fill="#9ec5f4" stroke="#1f6fc9" strokeWidth="1.5" />
            {trees.map((t, i) => (
              <circle key={i} cx={t.x} cy={t.y} r="4.5" fill="#3F7D3A" stroke="#FFFFFF" strokeWidth="1" />
            ))}
          </>
        )}
        {layer === "teren" && (
          <>
            <g fill="none" stroke="#7A5E34" strokeWidth="1" strokeOpacity="0.55">
              <path d="M30 80 C 60 110, 90 160, 105 182" />
              <path d="M70 22 C 110 70, 150 130, 165 182" />
              <path d="M125 17 C 165 60, 200 120, 215 178" />
              <path d="M185 18 C 210 50, 240 110, 255 174" />
            </g>
            <path
              d="M60 150 L105 120 M98 117 L106 120 L102 127 M130 120 L175 88 M168 85 L176 88 L172 95 M190 80 L225 56 M218 53 L226 56 L222 63"
              fill="none"
              stroke="#123f78"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <ellipse cx="236" cy="45" rx="20" ry="11" fill="none" stroke="#123f78" strokeWidth="1.8" strokeDasharray="4 3" />
            <Label x={30} y={148} w={34} text="112 m" />
            <Label x={188} y={28} w={34} text="105 m" />
          </>
        )}
        {layer === "gleba" && (
          <>
            <Label x={34} y={92} w={58} text="glina · kat. III" />
            <Label x={104} y={112} w={74} text="piasek glin. · kat. II" />
            <Label x={194} y={132} w={62} text="piasek · kat. I" />
          </>
        )}
        {layer === "sucho" && (
          <>
            <Label x={190} y={150} w={62} text="najsuchej" fill="#7a1a17" />
            <Label x={196} y={58} w={74} text="wilgotne zagłębienie" fill="#123f78" />
          </>
        )}

        {rule === "R1" && <path d={DITCH} fill="none" stroke="#F2B53A" strokeWidth="11" strokeLinecap="round" strokeOpacity="0.9" />}
        <path d={DITCH} fill="none" stroke="#1f6fc9" strokeWidth="4" strokeLinecap="round" />
        <text x="294" y="150" fontSize="8" fontWeight="700" fill="#123f78" textAnchor="end">
          rów R-3
        </text>
        {rule === "R2" && <ellipse cx="236" cy="45" rx="25" ry="15" fill="none" stroke="#F2B53A" strokeWidth="4" />}
        {rule === "R3" && <path d="M257 40 L250 168" fill="none" stroke="#F2B53A" strokeWidth="12" strokeLinecap="round" strokeOpacity="0.85" />}
        {(rule === "R7" || rule === "R8") && <polygon points={IRR_ZONE} fill="none" stroke="#F2B53A" strokeWidth="4" strokeLinejoin="round" />}
        <polygon
          points={FIELD}
          fill="none"
          stroke={rule === "R5" ? "#F2B53A" : "#1A1C19"}
          strokeWidth={rule === "R5" ? 5 : 2.2}
          strokeLinejoin="round"
        />
      </svg>

      {actions.map((a) => {
        const s = pin === a.n;
        const size = s ? 44 : 36;
        return (
          <button
            key={a.n}
            onClick={() => onPin(a)}
            aria-label={`${a.n}. ${a.co}`}
            aria-pressed={s}
            className="absolute inline-flex items-center justify-center rounded-full border-[3px] border-white p-0 font-extrabold text-white max-sm:scale-90"
            style={{
              left: `calc(${a.x}% - ${size / 2}px)`,
              top: `calc(${a.y}% - ${size / 2}px)`,
              width: size,
              height: size,
              background: CAT[a.kategoria].color,
              fontSize: s ? 17 : 15,
              boxShadow: s ? "0 0 0 3px #1A1C19, 0 4px 10px rgba(0,0,0,0.3)" : "0 2px 6px rgba(0,0,0,0.3)",
              zIndex: s ? 2 : 1,
            }}
          >
            {a.n}
          </button>
        );
      })}
      <span className="absolute bottom-2 left-2 rounded-md bg-white/95 px-2 py-1 text-[11px] text-ink-2">N ↑ · 100 m</span>
    </div>
  );
}

const sw = (c: string) => ({ width: 14, height: 14, borderRadius: 3, background: c });

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
