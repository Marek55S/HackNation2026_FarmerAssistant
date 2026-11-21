// Clipping raster cells to the parcel boundary, so map squares never stick out beyond the parcel.

import type { LngLat } from "./types";

type Pt = [number, number];

export function pointInRing(p: Pt, ring: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-30) + xi) c = !c;
  }
  return c;
}

/** Sutherland–Hodgman: (possibly concave) parcel ring clipped by an axis-aligned cell (convex window). */
function clipByRect(ring: Pt[], x0: number, y0: number, x1: number, y1: number): Pt[] {
  const edges: [(p: Pt) => boolean, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const src = out;
    out = [];
    for (let i = 0; i < src.length; i++) {
      const cur = src[i];
      const prev = src[(i + src.length - 1) % src.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (!out.length) return [];
  }
  return out;
}

/**
 * Part of the cell [x0,x1]×[y0,y1] that lies inside the parcel, as a closed ring; null when outside.
 * Cells fully inside stay squares (cheap path); boundary cells are clipped exactly.
 */
export function cellInParcel(ring: LngLat[], bbox: [number, number, number, number], x0: number, y0: number, x1: number, y1: number): Pt[] | null {
  const open = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  if (x1 < bbox[0] || x0 > bbox[2] || y1 < bbox[1] || y0 > bbox[3]) return null;
  const corners: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const allIn = corners.every((c) => pointInRing(c, open as Pt[]));
  const vertexInside = open.some(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1);
  if (allIn && !vertexInside) return [...corners, corners[0]];
  const clipped = clipByRect(open as Pt[], x0, y0, x1, y1);
  if (clipped.length < 3) return null;
  return [...clipped, clipped[0]];
}
