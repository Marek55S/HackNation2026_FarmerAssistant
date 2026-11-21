// Example map layers for a parcel: ditch, depression, irrigation zone, runoff and 10 m rasters.
// Positions are defined relative to the parcel's bounding box (u = west→east, v = north→south, 0…1)
// and mapped onto the real ULDK boundary. The real pipeline returns the same `ReportMap` (TODO T5.6).

import type { LngLat, MapFeature, MapLabel, RasterGrid, ReportMap } from "../types";

type Ring = LngLat[];

const M_PER_DEG_LAT = 110540;
const mPerDegLon = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export function bboxOf(ring: Ring): [number, number, number, number] {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

function pointInRing([x, y]: LngLat, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Part of the ring south of `lat` (Sutherland–Hodgman against one half-plane). */
function clipSouthOf(ring: Ring, lat: number): Ring {
  const out: Ring = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const ain = a[1] <= lat;
    const bin = b[1] <= lat;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (lat - a[1]) / (b[1] - a[1]);
      out.push([a[0] + t * (b[0] - a[0]), lat]);
    }
  }
  if (out.length) out.push(out[0]);
  return out;
}

export function areaHa(ring: Ring): number {
  const lat0 = ring[0][1];
  const kx = mPerDegLon(lat0);
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * kx * ring[i + 1][1] * M_PER_DEG_LAT - ring[i + 1][0] * kx * ring[i][1] * M_PER_DEG_LAT;
  return Math.abs(a) / 2 / 10000;
}

function centroid(ring: Ring): LngLat {
  const pts = ring.slice(0, -1);
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

export interface ParcelMapResult {
  map: ReportMap;
  /** Pin location per recommendation number */
  pins: Record<number, LngLat>;
  /** Area of the irrigation zone in hectares */
  irrigationHa: number;
}

export function buildParcelMap(ring: Ring): ParcelMapResult {
  const [w, s, e, n] = bboxOf(ring);
  const at = (u: number, v: number): LngLat => [w + u * (e - w), n - v * (n - s)];
  const lat0 = (s + n) / 2;

  // R1 ditch along the eastern boundary, just outside the field
  const ditch: LngLat[] = [at(0.95, -0.06), at(1.03, 0.2), at(1.03, 0.34), at(0.95, 0.58), at(0.84, 0.78), at(0.71, 0.97), at(0.66, 1.06)];
  // R2 depression: ~22 m radius
  const dc = at(0.8, 0.37);
  const r = 22;
  const depression: LngLat[] = Array.from({ length: 25 }, (_, k) => {
    const t = (k / 24) * 2 * Math.PI;
    return [dc[0] + (Math.cos(t) * r * 1.3) / mPerDegLon(lat0), dc[1] + (Math.sin(t) * r) / M_PER_DEG_LAT];
  });
  // R3 tree / grass strip along the inner eastern edge
  const strip: LngLat[] = [at(0.95, 0.36), at(0.88, 0.57), at(0.77, 0.75)];
  // R7/R8 irrigation zone: the southern, sandy part of the field
  const zone = clipSouthOf(ring, n - 0.58 * (n - s));

  const arrow = (from: LngLat, to: LngLat): LngLat[] => {
    const dx = (to[0] - from[0]) * mPerDegLon(lat0);
    const dy = (to[1] - from[1]) * M_PER_DEG_LAT;
    const len = Math.hypot(dx, dy);
    const head = (angle: number): LngLat => {
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      const hx = ((-dx * c + dy * sn) / len) * 14;
      const hy = ((-dx * sn - dy * c) / len) * 14;
      return [to[0] + hx / mPerDegLon(lat0), to[1] + hy / M_PER_DEG_LAT];
    };
    return [from, to, head(0.45), to, head(-0.45)];
  };

  const features: MapFeature[] = [
    { kind: "strefa-podlewania", regula: "R7", geometry: { type: "Polygon", coordinates: [zone] }, layers: ["plan"] },
    { kind: "zaglebienie", regula: "R2", geometry: { type: "Polygon", coordinates: [depression] }, layers: ["plan", "teren"] },
    { kind: "pas-zadrzewien", regula: "R3", geometry: { type: "LineString", coordinates: strip }, layers: ["plan"] },
    { kind: "row", regula: "R1", geometry: { type: "LineString", coordinates: ditch }, layers: ["plan", "sucho", "teren", "gleba"] },
    ...[
      arrow(at(0.2, 0.17), at(0.5, 0.27)),
      arrow(at(0.42, 0.45), at(0.7, 0.4)),
      arrow(at(0.62, 0.86), at(0.72, 0.6)),
    ].map((coords): MapFeature => ({ kind: "splyw", regula: null, geometry: { type: "LineString", coordinates: coords }, layers: ["teren"] })),
  ];

  const labels: MapLabel[] = [
    { punkt: at(1.06, 0.47), text: "rów R-3", layers: ["plan", "sucho", "teren", "gleba"], tone: "blue", minor: true },
    { punkt: at(0.78, 0.28), text: "wilgotne zagłębienie", layers: ["sucho"], tone: "blue" },
    { punkt: at(0.6, 0.94), text: "najsuchej", layers: ["sucho"], tone: "red" },
    { punkt: at(0.16, 0.13), text: "112 m n.p.m.", layers: ["teren"], tone: "ink" },
    { punkt: at(0.78, 0.28), text: "105 m", layers: ["teren"], tone: "ink" },
    { punkt: at(0.16, 0.3), text: "glina · kat. III", layers: ["gleba"], tone: "ink" },
    { punkt: at(0.5, 0.47), text: "piasek glin. · kat. II", layers: ["gleba"], tone: "ink" },
    { punkt: at(0.55, 0.72), text: "piasek · kat. I", layers: ["gleba"], tone: "ink" },
  ];

  // 10 m rasters (like Sentinel-2 pixels), class indexes per layer (see LEGEND in the map component)
  const cellM = 10;
  const cols = Math.max(4, Math.round(((e - w) * mPerDegLon(lat0)) / cellM));
  const rows = Math.max(4, Math.round(((n - s) * M_PER_DEG_LAT) / cellM));
  const grid = (fn: (u: number, v: number) => number): RasterGrid => {
    const values: number[] = [];
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const u = (i + 0.5) / cols;
        const v = (j + 0.5) / rows;
        values.push(pointInRing(at(u, v), ring) ? fn(u, v) : -1);
      }
    return { bbox: [w, s, e, n], cols, rows, values, cellM };
  };
  const wet = (u: number, v: number) => Math.exp(-(((u - 0.8) / 0.08) ** 2 + ((v - 0.37) / 0.06) ** 2));
  const rasters: ReportMap["rasters"] = {
    // 0 wetter · 1 as usual · 2 a bit drier · 3 drier · 4 much drier
    sucho: grid((u, v) => {
      const a = 0.7 - 1.7 * v - 0.6 * u + 3 * wet(u, v) + 0.3 * Math.sin(u * 23 + v * 31);
      return a <= -1.5 ? 4 : a <= -0.95 ? 3 : a <= -0.35 ? 2 : a < 0.8 ? 1 : 0;
    }),
    // 0 highest … 4 lowest
    teren: grid((u, v) => {
      const el = 105 + 7.5 * Math.min(1, Math.hypot(u - 0.8, (v - 0.37) * 0.9)) + 0.4 * Math.sin(u * 9) * Math.cos(v * 7);
      return el > 110.2 ? 0 : el > 109 ? 1 : el > 107.6 ? 2 : el > 106.2 ? 3 : 4;
    }),
    // 0 clay · 1 loamy sand · 2 sand
    gleba: grid((u, v) => (v + 0.06 * Math.sin(u * 8) < 0.33 ? 0 : v + 0.05 * Math.cos(u * 6) < 0.6 ? 1 : 2)),
  };

  return {
    map: { features, rasters, labels },
    pins: { 1: at(1.03, 0.26), 2: dc, 3: at(0.91, 0.47), 4: at(0.38, 0.22), 5: centroid(zone) },
    irrigationHa: Math.round(areaHa(zone) * 10) / 10,
  };
}
