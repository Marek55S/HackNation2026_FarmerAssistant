// Report map layers shared by the interactive map (parcel-map.tsx) and the still images for the PDF
// (map-snapshot.ts), so both draw exactly the same thing. Browser only (canvas, MapLibre).

import type maplibregl from "maplibre-gl";
import type { ExpressionSpecification } from "maplibre-gl";
import type { LngLat, MapLayer, RasterGrid, ReportMap, ReportPart, Zalecenie } from "@/lib/types";
import { partColor, RASTER_RGBA } from "./map-style";

// Selected recommendation: a white halo, which reads on the photo without adding another colour.
// Field boundary: yellow, as in FarmSense.
export const HL = "#FFFFFF";
export const FIELD = "#F2C14E";

export function bounds(ring: LngLat[]): [LngLat, LngLat] {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

export const RASTER_KEYS = ["sucho", "teren", "gleba"] as const;

/**
 * Raster grid → PNG for an image source. The grid (one pixel per cell) is scaled up with smoothing, so 10 m
 * cells read as a smooth field instead of hard squares, and then cut exactly to the parcel boundary
 * (nothing sticks out beyond the parcel).
 */
function rasterImage(g: RasterGrid, palette: [number, number, number, number][], ring: LngLat[]): string {
  const small = document.createElement("canvas");
  small.width = g.cols;
  small.height = g.rows;
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(g.cols, g.rows);
  g.values.forEach((v, k) => {
    const [r, gr, b, a] = v >= 0 ? palette[v] ?? [0, 0, 0, 0] : [0, 0, 0, 0];
    img.data.set([r, gr, b, Math.round(a * 255)], k * 4);
  });
  sctx.putImageData(img, 0, 0);

  const scale = Math.max(1, Math.min(16, Math.floor(1024 / Math.max(g.cols, g.rows))));
  const c = document.createElement("canvas");
  c.width = g.cols * scale;
  c.height = g.rows * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, c.width, c.height);
  if (ring.length >= 3) {
    // keep only the part inside the parcel (lon/lat → canvas pixels over the raster bbox)
    const [w, s, e, n] = g.bbox;
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ring.forEach(([lon, lat], i) => {
      const x = ((lon - w) / (e - w)) * c.width;
      const y = ((n - lat) / (n - s)) * c.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }
  return c.toDataURL("image/png");
}

const corners = (g: RasterGrid): [[number, number], [number, number], [number, number], [number, number]] => {
  const [w, s, e, n] = g.bbox;
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
};

/** Sources and layers of the report map. Call once the base style has loaded. */
export function addReportLayers(map: maplibregl.Map, parcel: LngLat[], data: ReportMap, parts: ReportPart[]) {
  const ring = [...parcel];
  map.addSource("pole", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } } });
  // One image source + layer per raster view, toggled by visibility (swapping data in one source left stale tiles at high zoom).
  for (const k of RASTER_KEYS) {
    const g = data.rasters[k];
    if (g) map.addSource(`raster-${k}`, { type: "image", url: rasterImage(g, RASTER_RGBA[k], parcel), coordinates: corners(g) });
  }
  map.addSource("obiekty", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: data.features.map((f) => ({
        type: "Feature",
        properties: { kind: f.kind, regula: f.regula ?? "", ls: `,${f.layers.join(",")},` },
        geometry: f.geometry,
      })),
    },
  });

  map.addLayer({ id: "pole-wypelnienie", type: "fill", source: "pole", paint: { "fill-color": FIELD, "fill-opacity": 0.14 } });
  // Crop parts (only when the parcel has more than one): own colour each, emphasis set by applyPartView.
  const drawn = parts.filter((p) => p.geometry && p.geometry.length > 0);
  if (parts.length > 1 && drawn.length > 0) {
    map.addSource("czesci", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: parts.flatMap((p, i) =>
          p.geometry ? [{ type: "Feature" as const, properties: { id: p.id, kolor: partColor(i) }, geometry: { type: "MultiPolygon" as const, coordinates: p.geometry } }] : [],
        ),
      },
    });
    map.addLayer({ id: "czesci-wypelnienie", type: "fill", source: "czesci", paint: { "fill-color": ["get", "kolor"], "fill-opacity": 0.22 } });
  }
  for (const k of RASTER_KEYS) {
    if (!data.rasters[k]) continue;
    map.addLayer({
      id: `raster-${k}`,
      type: "raster",
      source: `raster-${k}`,
      layout: { visibility: "none" },
      paint: { "raster-opacity": 1, "raster-resampling": "linear", "raster-fade-duration": 0 },
    });
  }
  // Irrigation zone: a light tint, not a blanket over the field (it is a hull around the driest pixels, often large).
  map.addLayer({ id: "strefa", type: "fill", source: "obiekty", filter: ["==", ["get", "kind"], "strefa-podlewania"], paint: { "fill-color": "#2b7a8c", "fill-opacity": 0.12 } });
  map.addLayer({ id: "zaglebienie", type: "fill", source: "obiekty", filter: ["==", ["get", "kind"], "zaglebienie"], paint: { "fill-color": "#8ec9c4", "fill-opacity": 0.3 } });
  map.addLayer({
    id: "wyroznienie",
    type: "line",
    source: "obiekty",
    filter: ["==", ["get", "regula"], "-"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": HL, "line-width": 9, "line-opacity": 0.85, "line-blur": 1.5 },
  });
  map.addLayer({ id: "strefa-linia", type: "line", source: "obiekty", filter: ["==", ["get", "kind"], "strefa-podlewania"], paint: { "line-color": "#2b7a8c", "line-width": 1.5, "line-opacity": 0.75, "line-dasharray": [2, 2] } });
  map.addLayer({ id: "zaglebienie-linia", type: "line", source: "obiekty", filter: ["==", ["get", "kind"], "zaglebienie"], paint: { "line-color": "#174a57", "line-width": 1.5, "line-opacity": 0.7, "line-dasharray": [2, 1.5] } });
  map.addLayer({
    id: "pas",
    type: "line",
    source: "obiekty",
    filter: ["==", ["get", "kind"], "pas-zadrzewien"],
    layout: { "line-cap": "round" },
    paint: { "line-color": "#3F7D3A", "line-width": 8, "line-dasharray": [0.1, 1.6] },
  });
  map.addLayer({
    id: "row",
    type: "line",
    source: "obiekty",
    filter: ["==", ["get", "kind"], "row"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#2b7a8c", "line-width": 4 },
  });
  map.addLayer({
    id: "splyw",
    type: "line",
    source: "obiekty",
    filter: ["==", ["get", "kind"], "splyw"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#174a57", "line-width": 3 },
  });
  map.addLayer({ id: "pole-obwodka", type: "line", source: "pole", paint: { "line-color": "#1A1C19", "line-width": 5, "line-opacity": 0.35 } });
  map.addLayer({ id: "pole", type: "line", source: "pole", layout: { "line-join": "round" }, paint: { "line-color": FIELD, "line-width": 2.5 } });
  // Part boundaries on top of everything (irrigation zones and depressions would hide them otherwise);
  // the mask dims the other parts when one crop is shown on its own.
  if (map.getSource("czesci")) {
    map.addLayer({ id: "czesci-maska", type: "fill", source: "czesci", paint: { "fill-color": "#0b1210", "fill-opacity": 0 } });
    map.addLayer({ id: "czesci-obwodka", type: "line", source: "czesci", layout: { "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.8 } });
    map.addLayer({ id: "czesci-linia", type: "line", source: "czesci", layout: { "line-join": "round" }, paint: { "line-color": ["get", "kolor"], "line-width": 2.5 } });
  }
}

const KIND: Record<string, string> = {
  strefa: "strefa-podlewania",
  "strefa-linia": "strefa-podlewania",
  zaglebienie: "zaglebienie",
  "zaglebienie-linia": "zaglebienie",
  pas: "pas-zadrzewien",
  row: "row",
  splyw: "splyw",
};

/**
 * Map view (plan / dry / terrain / soil) and the selected action.
 * Big areas from the backend (irrigation zone, terrain depression — often larger than the parcel) are not on the
 * default plan: they appear on their own view or once the farmer picks the action they belong to.
 */
export function applyLayerView(map: maplibregl.Map, layer: MapLayer, sel: Zalecenie | undefined, picked: boolean) {
  const inLayer: ExpressionSpecification = ["in", `,${layer},`, ["get", "ls"]];
  const showZone = layer === "sucho" || (picked && (sel?.regula === "R7" || sel?.regula === "R8"));
  const showHollow = layer === "teren" || (picked && sel?.regula === "R2");
  const none: ExpressionSpecification = ["==", ["get", "kind"], "-"];
  for (const id of Object.keys(KIND)) {
    const zone = id === "strefa" || id === "strefa-linia";
    const hollow = id === "zaglebienie" || id === "zaglebienie-linia";
    // The depression is filled only on the action plan; on the terrain view it is just outlined.
    if ((zone && !showZone) || (hollow && !showHollow) || (id === "zaglebienie" && layer !== "plan")) {
      map.setFilter(id, none);
      continue;
    }
    map.setFilter(id, ["all", ["==", ["get", "kind"], KIND[id]], inLayer]);
  }
  for (const k of RASTER_KEYS) if (map.getLayer(`raster-${k}`)) map.setLayoutProperty(`raster-${k}`, "visibility", k === layer ? "visible" : "none");

  const rule = sel?.regula === "R8" ? "R7" : (sel?.regula ?? "-");
  map.setFilter("wyroznienie", ["==", ["get", "regula"], rule]);
  map.setPaintProperty("pole", "line-color", sel?.regula === "R5" ? HL : FIELD);
  map.setPaintProperty("pole", "line-width", sel?.regula === "R5" ? 5 : 2.5);
  map.setLayoutProperty("pole-wypelnienie", "visibility", layer === "plan" ? "visible" : "none");
}

/**
 * One crop part on its own (`part`) or the whole parcel (null): on the whole parcel each part is lightly tinted
 * (plan view only — on raster views the tint would mix with their colours); one part: no tint, the other parts
 * darkened, its own outline thick. No-op on parcels with a single crop.
 */
export function applyPartView(map: maplibregl.Map, layer: MapLayer, part: string | null) {
  if (!map.getLayer("czesci-wypelnienie")) return;
  const on: ExpressionSpecification = ["==", ["get", "id"], part ?? "-"];
  map.setPaintProperty("czesci-wypelnienie", "fill-opacity", layer === "plan" && !part ? 0.22 : 0);
  map.setPaintProperty("czesci-maska", "fill-opacity", part ? ["case", on, 0, 0.5] : 0);
  map.setPaintProperty("czesci-linia", "line-width", part ? ["case", on, 4, 1.5] : 2.5);
  map.setPaintProperty("czesci-obwodka", "line-width", part ? ["case", on, 7, 0] : 5);
  map.setPaintProperty("czesci-obwodka", "line-opacity", part ? 0.9 : 0.6);
  map.setPaintProperty("pole-wypelnienie", "fill-opacity", 0);
}
