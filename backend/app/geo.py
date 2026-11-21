"""Geometria działki bez zewnętrznych bibliotek: WKT → pierścień, pole, centroid, punkty wewnątrz (T2.4)."""
from __future__ import annotations

import math
import re

R = 6371008.8


def parse_wkt(wkt: str) -> list[list[tuple[float, float]]]:
    """Zwraca listę zewnętrznych pierścieni (lon, lat). Obsługuje POLYGON i MULTIPOLYGON (otwory pomija)."""
    wkt = wkt.split(";", 1)[-1].strip()
    rings = []
    for poly in re.findall(r"\(\(([^()]+)\)", wkt):
        pts = [tuple(map(float, p.split()[:2])) for p in poly.split(",")]
        rings.append(pts)
    return rings


def _xy(pts, lat0):
    k = math.cos(math.radians(lat0))
    return [(math.radians(x) * R * k, math.radians(y) * R) for x, y in pts]


def area_m2(rings) -> float:
    lat0 = sum(p[1] for p in rings[0]) / len(rings[0])
    tot = 0.0
    for ring in rings:
        xy = _xy(ring, lat0)
        tot += abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(xy, xy[1:] + xy[:1]))) / 2
    return tot


def centroid(rings) -> tuple[float, float]:
    ring = max(rings, key=len)
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        f = x1 * y2 - x2 * y1
        a += f
        cx += (x1 + x2) * f
        cy += (y1 + y2) * f
    if abs(a) < 1e-15:
        return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    return cx / (3 * a), cy / (3 * a)


def inside(pt, ring) -> bool:
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1 + 1e-30) + x1:
            c = not c
    return c


def inside_any(pt, rings) -> bool:
    return any(inside(pt, r) for r in rings)


def bbox(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def grid_points(rings, n: int = 7) -> list[tuple[float, float]]:
    """Punkty siatki leżące wewnątrz działki (do odczytów IUNG i przecięcia z uprawami ARiMR)."""
    x0, y0, x1, y1 = bbox(rings)
    pts = []
    for i in range(1, n + 1):
        for j in range(1, n + 1):
            p = (x0 + (x1 - x0) * i / (n + 1), y0 + (y1 - y0) * j / (n + 1))
            if inside_any(p, rings):
                pts.append(p)
    c = centroid(rings)
    if inside_any(c, rings):
        pts.insert(0, c)
    return pts or [c]


def otoczka(pts) -> list[list[float]] | None:
    """Otoczka wypukła (monotone chain) jako zamknięty pierścień [lon, lat]."""
    pts = sorted(set((round(x, 7), round(y, 7)) for x, y in pts))
    if len(pts) < 3:
        return None
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    h = lo[:-1] + up[:-1]
    return [[round(x, 6), round(y, 6)] for x, y in h + [h[0]]]
