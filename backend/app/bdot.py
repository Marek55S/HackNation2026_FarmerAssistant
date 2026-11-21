"""Hydrografia z BDOT10k (P8 → F9): rowy melioracyjne, rzeki, kanały, wody powierzchniowe.

Z ZIP-a powiatu (~50 MB) pobieramy przez HTTP Range tylko 4 pliki (~2 MB), parsujemy raz i trzymamy w cache
(dane stałe, stan obecny). Odległość liczymy od granicy działki (0 = obiekt przecina działkę).
"""
from __future__ import annotations

import asyncio
import json
import math
import re
import time

import numpy as np

from . import geo
from .net import CACHE_DIR, Wynik

URL = "https://opendata.geoportal.gov.pl/bdot10k/schemat2021/{woj}/{pow}_GML.zip"
WARSTWY = {"SWRM_L": "rów melioracyjny", "SWRS_L": "rzeka / strumień", "SWKN_L": "kanał", "PTWP_A": "wody powierzchniowe"}


def _parse_powiat(woj: str, pow_: str) -> dict:
    from pyproj import Transformer
    from remotezip import RemoteZip
    tr = Transformer.from_crs(2180, 4326, always_xy=True)
    out = {}
    with RemoteZip(URL.format(woj=woj, pow=pow_)) as z:
        for name in z.namelist():
            key = next((k for k in WARSTWY if name.endswith(f"__OT_{k}.xml")), None)
            if not key:
                continue
            txt = z.read(name).decode("utf-8", "ignore")
            feats = []
            for feat in re.findall(r"<ot:OT_" + key + r"\b.*?</ot:OT_" + key + r">", txt, re.S):
                nazwa = re.search(r"<ot:nazwa[^>]*>([^<]*)<", feat)
                for pl in re.findall(r"<gml:posList[^>]*>([^<]+)<", feat)[:1]:   # bez otworów
                    v = np.array(pl.split(), float).reshape(-1, 2)
                    lon, lat = tr.transform(v[:, 0], v[:, 1])            # GML: (wschód, północ)
                    feats.append({"n": nazwa.group(1) if nazwa else "", "c": np.round(np.c_[lon, lat], 6).tolist()})
            out[key] = feats
    return out


def _wczytaj(woj: str, pow_: str) -> dict:
    p = CACHE_DIR / f"bdot_{pow_}.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    d = _parse_powiat(woj, pow_)
    p.write_text(json.dumps(d), encoding="utf-8")
    return d


def _dens(pts: np.ndarray, step: float) -> np.ndarray:
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = max(1, int(np.hypot(*(b - a)) / step))
        out.extend(a + (b - a) * k / n for k in range(1, n + 1))
    return np.array(out)


async def hydrografia(rings, teryt: str) -> Wynik:
    t0 = time.perf_counter()
    m = re.match(r"(\d{2})(\d{2})", teryt or "")
    if not m:
        return Wynik("BDOT10k – hydrografia", None, powod="brak kodu TERYT powiatu")
    woj, pow_ = m.group(1), m.group(1) + m.group(2)
    try:
        d = await asyncio.to_thread(_wczytaj, woj, pow_)
    except Exception as e:  # noqa: BLE001
        return Wynik("BDOT10k – hydrografia", None, powod=f"{type(e).__name__}: {e}"[:200],
                     url=URL.format(woj=woj, pow=pow_), czas_ms=int((time.perf_counter() - t0) * 1000))
    # układ lokalny w metrach
    cx, cy = geo.centroid(rings)
    kx, ky = 111320 * math.cos(math.radians(cy)), 110574
    loc = lambda a: np.c_[(a[:, 0] - cx) * kx, (a[:, 1] - cy) * ky]
    granica = np.vstack([_dens(loc(np.array(r + r[:1])), 10.0) for r in rings])
    R = 600.0
    rp = float(np.hypot(granica[:, 0], granica[:, 1]).max())
    wynik = {}
    linie = []
    for key, feats in d.items():
        best = None
        for f in feats:
            c = np.array(f["c"])
            xy = loc(c)
            bx = max(0.0, xy[:, 0].min(), -xy[:, 0].max())
            by = max(0.0, xy[:, 1].min(), -xy[:, 1].max())
            if math.hypot(bx, by) > R + rp + 3000:      # prostokąt obiektu daleko od działki
                continue
            dd = _dens(xy, 10.0)
            dist = np.sqrt(((dd[:, None, :] - granica[None, :, :]) ** 2).sum(-1))
            i, j = np.unravel_index(np.argmin(dist), dist.shape)
            dmin = float(dist[i, j])
            if any(geo.inside_any((float(p[0]), float(p[1])), rings) for p in c[:: max(1, len(c) // 20)]):
                dmin = 0.0
            if dmin <= R:
                linie.append({"typ": key, "c": c.tolist()})
            if best is None or dmin < best["dist_m"]:
                px, py = dd[i]
                best = {"typ": WARSTWY[key], "nazwa": f["n"], "dist_m": dmin,
                        "lon": float(cx + px / kx), "lat": float(cy + py / ky)}
        if best:
            wynik[key] = best
    return Wynik("BDOT10k – hydrografia", {"najblizsze": wynik, "linie": linie, "powiat": pow_},
                 url=URL.format(woj=woj, pow=pow_), czas_ms=int((time.perf_counter() - t0) * 1000))
