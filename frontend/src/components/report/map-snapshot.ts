// Still images of the report map for the PDF: each view is drawn in an off-screen MapLibre map (same layers as the
// interactive one), then pins and labels are painted on top, because on screen they are HTML markers and do not
// end up in the map canvas. Browser only.

import maplibregl from "maplibre-gl";
import type { LngLat, MapLayer, ReportMap, ReportPart, Zalecenie } from "@/lib/types";
import { STYLE } from "../map/base-map";
import { CAT } from "./map-style";
import { addReportLayers, applyLayerView, applyPartView, bounds } from "./report-layers";

/** Image size in CSS pixels (3:2), drawn at 2× for print. */
export const SNAP_W = 960;
export const SNAP_H = 640;
const RATIO = 2;

export interface MapSnapshot {
  src: string;
  /** Metres per CSS pixel of the image (for the scale bar) */
  mpp: number;
  /** Which basemap made it into the picture */
  base: "orto" | "osm";
}

export interface SnapshotSpec {
  parcel: LngLat[];
  data: ReportMap;
  parts: ReportPart[];
  layer: MapLayer;
  /** Pins to paint (numbers of the actions); empty = none */
  pins: Zalecenie[];
  /** Crop part shown on its own; null = whole parcel */
  part?: string | null;
  /** Draw the map labels of this view (ditch names etc.) */
  labels?: boolean;
  /** Size of pins and labels; >1 for images printed small (two side by side) */
  markScale?: number;
}

const LABEL_INK = { ink: "#1A1C19", red: "#8E1F1F", blue: "#174a57", muted: "#5F625B" };

function waitIdle(map: maplibregl.Map, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    map.once("idle", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function snapshotMap(spec: SnapshotSpec): Promise<MapSnapshot> {
  const box = document.createElement("div");
  // Off-screen but laid out (a hidden element has no size, and WebGL would not draw).
  Object.assign(box.style, { position: "fixed", left: "-10000px", top: "0", width: `${SNAP_W}px`, height: `${SNAP_H}px`, pointerEvents: "none" });
  box.setAttribute("aria-hidden", "true");
  document.body.appendChild(box);

  const focus = spec.part ? spec.parts.find((p) => p.id === spec.part) : undefined;
  const ring = focus?.geometry ? focus.geometry.flat(2) : spec.parcel;
  const map = new maplibregl.Map({
    container: box,
    style: structuredClone(STYLE),
    bounds: bounds(ring),
    fitBoundsOptions: { padding: 48, maxZoom: 18 },
    maxZoom: 19,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    pixelRatio: RATIO,
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });

  try {
    let tiles = 0;
    let errors = 0;
    map.on("sourcedata", (e) => {
      if (e.sourceId === "orto" && e.tile) tiles++;
    });
    map.on("error", (e: maplibregl.ErrorEvent & { sourceId?: string }) => {
      if (e.sourceId === "orto") errors++;
    });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Mapa nie wczytała się")), 20000);
      map.once("load", () => {
        clearTimeout(t);
        resolve();
      });
    });
    addReportLayers(map, spec.parcel, spec.data, spec.parts);
    applyLayerView(map, spec.layer, undefined, false);
    applyPartView(map, spec.layer, spec.part ?? null);
    await waitIdle(map, 15000);

    // Geoportal sometimes does not answer: fall back to OpenStreetMap, as the interactive map does.
    let base: MapSnapshot["base"] = "orto";
    if (tiles === 0 || errors >= 4) {
      map.setLayoutProperty("orto", "visibility", "none");
      map.setLayoutProperty("osm", "visibility", "visible");
      base = "osm";
      await waitIdle(map, 15000);
    }

    const out = document.createElement("canvas");
    out.width = SNAP_W * RATIO;
    out.height = SNAP_H * RATIO;
    const ctx = out.getContext("2d")!;
    ctx.drawImage(map.getCanvas(), 0, 0, out.width, out.height);
    ctx.scale(RATIO, RATIO);
    const k = spec.markScale ?? 1;

    if (spec.labels) {
      ctx.font = `700 ${12 * k}px 'Inter Variable', Inter, system-ui, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      for (const l of spec.data.labels) {
        if (!l.layers.includes(spec.layer)) continue;
        const pt = map.project(l.punkt);
        if (pt.x < 0 || pt.y < 0 || pt.x > SNAP_W || pt.y > SNAP_H) continue;
        const w = ctx.measureText(l.text).width + 12 * k;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        roundRect(ctx, pt.x - w / 2, pt.y - 10 * k, w, 20 * k, 4 * k);
        ctx.fill();
        ctx.fillStyle = LABEL_INK[l.tone];
        ctx.fillText(l.text, pt.x, pt.y + 0.5);
      }
    }

    ctx.font = `800 ${14 * k}px 'Inter Variable', Inter, system-ui, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    for (const a of spec.pins) {
      const pt = map.project(a.punkt);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 15 * k, 0, Math.PI * 2);
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1.5;
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 12 * k, 0, Math.PI * 2);
      ctx.fillStyle = CAT[a.kategoria].color;
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(String(a.n), pt.x, pt.y + 0.5);
    }

    const lat = map.getCenter().lat;
    const mpp = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
    return { src: out.toDataURL("image/jpeg", 0.9), mpp, base };
  } finally {
    map.remove();
    box.remove();
  }
}
