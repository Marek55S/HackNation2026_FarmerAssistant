"""Teren (P7 → F7, F7b, F8): Copernicus DEM GLO‑30 z Earth Search, odczyt tylko okna działki + bufora.

- spadek (%), strefy > 3%;
- zagłębienia bezodpływowe: wypełnianie priority‑flood (Wang & Liu 2006), głębokość > 0,1 m;
- kierunki spływu D8 i akumulacja → punkt, w którym najwięcej wody wypływa z działki.
Uwaga: Copernicus DEM to model powierzchni (DSM, 30 m) – drzewa i budynki podnoszą teren; NMT 1 m GUGiK – później (w tle).
"""
from __future__ import annotations

import heapq
import math
import time

import httpx
import numpy as np

from . import geo
from .net import Wynik

STAC = "https://earth-search.aws.element84.com/v1/search"
BUF_M = 400.0
GLEBOKOSC_MIN = 0.10      # m ⚙️
SPADEK_PROG = 3.0         # % ⚙️


def _https(href: str) -> str:
    return href.replace("s3://copernicus-dem-30m/", "https://copernicus-dem-30m.s3.amazonaws.com/")


def _read_window(urls: list[str], bounds):
    import rasterio
    from rasterio.merge import merge
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                      GDAL_HTTP_TIMEOUT="20"):
        srcs = [rasterio.open(u) for u in urls]
        try:
            arr, tr = merge(srcs, bounds=bounds, nodata=-9999.0)
        finally:
            for s in srcs:
                s.close()
    return arr[0].astype(float), tr


async def pobierz_dem(client: httpx.AsyncClient, rings) -> Wynik:
    import asyncio
    t0 = time.perf_counter()
    x0, y0, x1, y1 = geo.bbox(rings)
    lat0 = (y0 + y1) / 2
    dlat = BUF_M / 110574
    dlon = BUF_M / (111320 * math.cos(math.radians(lat0)))
    b = (x0 - dlon, y0 - dlat, x1 + dlon, y1 + dlat)
    try:
        r = await client.post(STAC, json={"collections": ["cop-dem-glo-30"], "bbox": list(b), "limit": 4}, timeout=15)
        urls = [_https(f["assets"]["data"]["href"]) for f in r.json()["features"]]
        if not urls:
            return Wynik("Copernicus DEM 30 m", None, powod="brak kafla DEM dla tego miejsca")
        arr, tr = await asyncio.to_thread(_read_window, urls, b)
    except Exception as e:  # noqa: BLE001
        return Wynik("Copernicus DEM 30 m", None, powod=f"{type(e).__name__}: {e}"[:200], url=STAC,
                     czas_ms=int((time.perf_counter() - t0) * 1000))
    arr[arr <= -1000] = np.nan
    return Wynik("Copernicus DEM 30 m", {"z": arr, "tr": tr}, url="https://registry.opendata.aws/copernicus-dem/",
                 czas_ms=int((time.perf_counter() - t0) * 1000))


def _fill(z: np.ndarray) -> np.ndarray:
    """Priority‑flood z małym spadkiem (eps), żeby płaskie obszary miały kierunek odpływu."""
    h, w = z.shape
    filled = np.full_like(z, np.nan)
    seen = np.zeros(z.shape, bool)
    pq = []
    for i in range(h):
        for j in range(w):
            if i in (0, h - 1) or j in (0, w - 1):
                heapq.heappush(pq, (z[i, j], i, j)); seen[i, j] = True
    eps = 1e-4
    while pq:
        e, i, j = heapq.heappop(pq)
        filled[i, j] = e
        for di in (-1, 0, 1):
            for dj in (-1, 0, 1):
                a, b = i + di, j + dj
                if (di or dj) and 0 <= a < h and 0 <= b < w and not seen[a, b]:
                    seen[a, b] = True
                    heapq.heappush(pq, (max(z[a, b], e + eps), a, b))
    return filled


def analiza_terenu(dem: dict, rings) -> dict:
    z, tr = dem["z"], dem["tr"]
    if np.isnan(z).all():
        return {"dostepny": False}
    z = np.where(np.isnan(z), np.nanmean(z), z)
    h, w = z.shape
    lat0 = tr.f + tr.e * h / 2
    dx = abs(tr.a) * 111320 * math.cos(math.radians(lat0))
    dy = abs(tr.e) * 110574
    lon = tr.c + tr.a * (np.arange(w) + 0.5)
    lat = tr.f + tr.e * (np.arange(h) + 0.5)
    LON, LAT = np.meshgrid(lon, lat)
    inside = np.array([[geo.inside_any((LON[i, j], LAT[i, j]), rings) for j in range(w)] for i in range(h)])
    if inside.sum() < 2:                    # bardzo mała działka – bierzemy komórki najbliższe centroidowi
        cx, cy = geo.centroid(rings)
        k = np.unravel_index(np.argmin((LON - cx) ** 2 + (LAT - cy) ** 2), z.shape)
        inside[k] = True
    cell = dx * dy

    gy, gx = np.gradient(z, dy, dx)
    slope = 100 * np.hypot(gx, gy)
    s_in = slope[inside]

    filled = _fill(z)
    depth = filled - z
    # zagłębienia: komponenty depth > próg, które dotykają działki lub bufora 60 m
    mask = depth > GLEBOKOSC_MIN
    lab = np.zeros(z.shape, int)
    comps = []
    n = 0
    for i in range(h):
        for j in range(w):
            if mask[i, j] and not lab[i, j]:
                n += 1
                stack = [(i, j)]; lab[i, j] = n; cells = []
                while stack:
                    a, b = stack.pop(); cells.append((a, b))
                    for di in (-1, 0, 1):
                        for dj in (-1, 0, 1):
                            c, d = a + di, b + dj
                            if 0 <= c < h and 0 <= d < w and mask[c, d] and not lab[c, d]:
                                lab[c, d] = n; stack.append((c, d))
                ii = np.array(cells)
                near = inside[ii[:, 0], ii[:, 1]].any()
                if not near:      # dopuszczamy zagłębienia przylegające do działki (1 komórka ≈ 30 m)
                    pad = np.zeros_like(inside)
                    pad[1:, :] |= inside[:-1, :]; pad[:-1, :] |= inside[1:, :]; pad[:, 1:] |= inside[:, :-1]; pad[:, :-1] |= inside[:, 1:]
                    near = pad[ii[:, 0], ii[:, 1]].any()
                if near:
                    vol = float(depth[ii[:, 0], ii[:, 1]].sum() * cell)
                    hx, hy = abs(tr.a) / 2, abs(tr.e) / 2
                    rogi = [(LON[a, b] + sx * hx, LAT[a, b] + sy * hy) for a, b in cells for sx in (-1, 1) for sy in (-1, 1)]
                    comps.append({"pow_ha": len(cells) * cell / 1e4, "objetosc_m3": vol,
                                  "udzial_w": float(inside[ii[:, 0], ii[:, 1]].mean()), "obrys": geo.otoczka(rogi),
                                  "lon": float(LON[ii[:, 0], ii[:, 1]].mean()), "lat": float(LAT[ii[:, 0], ii[:, 1]].mean()),
                                  "w_dzialce": bool(inside[ii[:, 0], ii[:, 1]].mean() > 0.5), "cells": cells})
    comps.sort(key=lambda c: -c["objetosc_m3"])

    # D8 na wypełnionym DEM + akumulacja
    nb = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    down = -np.ones((h, w, 2), int)
    for i in range(h):
        for j in range(w):
            best, bd = 0.0, None
            for di, dj in nb:
                a, b = i + di, j + dj
                if 0 <= a < h and 0 <= b < w:
                    dist = math.hypot(di * dy, dj * dx)
                    g = (filled[i, j] - filled[a, b]) / dist
                    if g > best:
                        best, bd = g, (a, b)
            if bd:
                down[i, j] = bd
    acc = np.ones((h, w))
    for k in np.argsort(-filled, axis=None):
        i, j = divmod(int(k), w)
        a, b = down[i, j]
        if a >= 0:
            acc[a, b] += acc[i, j]
    # wypływ z działki: komórka w działce, której odpływ wychodzi poza działkę, z największą akumulacją z działki
    acc_in = np.zeros((h, w))
    for k in np.argsort(-filled, axis=None):
        i, j = divmod(int(k), w)
        if inside[i, j]:
            acc_in[i, j] += 1
        a, b = down[i, j]
        if a >= 0 and inside[i, j]:
            acc_in[a, b] += acc_in[i, j]
    wyplyw = None
    best = 0
    for i in range(h):
        for j in range(w):
            if inside[i, j]:
                a, b = down[i, j]
                out = a < 0 or not inside[a, b]
                if out and acc_in[i, j] > best:
                    best, wyplyw = acc_in[i, j], (i, j)
    n_in = int(inside.sum())
    wyp = None
    if wyplyw:
        i, j = wyplyw
        wyp = {"lon": float(LON[i, j]), "lat": float(LAT[i, j]), "udzial": float(best / n_in),
               "w_zaglebienie": bool(depth[i, j] > GLEBOKOSC_MIN)}
    # strona świata najwyższego spadku (do opisu)
    zin = np.where(inside, z, np.nan)
    return {
        "dostepny": True, "cell_m": (round(dx), round(dy)),
        "spadek_max": float(np.percentile(s_in, 95)), "spadek_sr": float(s_in.mean()),
        "udzial_pow_3": float((s_in > SPADEK_PROG).mean()),
        "wys_min": float(np.nanmin(zin)), "wys_max": float(np.nanmax(zin)),
        "zaglebienia": [{k: v for k, v in c.items() if k != "cells"} for c in comps[:3]],
        "wyplyw": wyp,
        # do mapy: siatka (lon, lat, wysokość, głębokość zagłębienia) – tylko komórki w pobliżu działki
        "siatka": [(float(LON[i, j]), float(LAT[i, j]), float(z[i, j]), float(depth[i, j]), bool(inside[i, j]))
                   for i in range(h) for j in range(w)],
        "krok": (abs(tr.a), abs(tr.e)),
    }


# ---------------------------------------------------------------- NMT 1 m GUGiK (w tle, T3.6)
NMT_WCS = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF"
NMT_BUF_M = 200.0
_W_TOKU: set[str] = set()


def _nmt_bounds(rings):
    from pyproj import Transformer
    x0, y0, x1, y1 = geo.bbox(rings)
    tr = Transformer.from_crs(4326, 2180, always_xy=True)
    xs, ys = tr.transform([x0, x1, x0, x1], [y0, y0, y1, y1])
    return (int(min(xs) - NMT_BUF_M), int(min(ys) - NMT_BUF_M), int(max(xs) + NMT_BUF_M), int(max(ys) + NMT_BUF_M))


def _nmt_path(rings):
    from .net import CACHE_DIR
    b = _nmt_bounds(rings)
    return CACHE_DIR / f"nmt_{b[0]}_{b[1]}_{b[2]}_{b[3]}.tif"


def nmt_gotowy(rings) -> bool:
    return _nmt_path(rings).exists()


def pobierz_nmt(rings) -> None:
    """Pobiera NMT 1 m (60–160 s) do cache. Uruchamiane w tle po wskazaniu działki."""
    p = _nmt_path(rings)
    if p.exists() or p.name in _W_TOKU:
        return
    _W_TOKU.add(p.name)
    try:
        b = _nmt_bounds(rings)
        params = [("SERVICE", "WCS"), ("VERSION", "2.0.1"), ("REQUEST", "GetCoverage"),
                  ("COVERAGEID", "DTM_PL-KRON86-NH_TIFF"), ("FORMAT", "image/tiff"),
                  ("SUBSET", f"x({b[0]},{b[2]})"), ("SUBSET", f"y({b[1]},{b[3]})")]
        r = httpx.get(NMT_WCS, params=params, timeout=300)
        if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/tiff"):
            tmp = p.with_suffix(".part")
            tmp.write_bytes(r.content)
            tmp.replace(p)
    except Exception:  # noqa: BLE001 – w tle: brak NMT = zostaje Copernicus DEM
        pass
    finally:
        _W_TOKU.discard(p.name)


def wczytaj_nmt(rings) -> Wynik:
    """NMT 1 m z cache, uśredniony do ~5 m i przerzutowany do EPSG:4326 (ta sama analiza co dla DEM 30 m)."""
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import from_origin
    from rasterio.warp import reproject
    t0 = time.perf_counter()
    p = _nmt_path(rings)
    x0, y0, x1, y1 = geo.bbox(rings)
    lat0 = (y0 + y1) / 2
    dlat, dlon = NMT_BUF_M * 0.9 / 110574, NMT_BUF_M * 0.9 / (111320 * math.cos(math.radians(lat0)))
    rl, rt = 0.000075, 0.000045                       # ~5 m
    w = int((x1 - x0 + 2 * dlon) / rl) + 1
    h = int((y1 - y0 + 2 * dlat) / rt) + 1
    dtr = from_origin(x0 - dlon, y1 + dlat, rl, rt)
    dst = np.full((h, w), np.nan)
    with rasterio.open(p) as ds:
        reproject(rasterio.band(ds, 1), dst, dst_transform=dtr, dst_crs="EPSG:4326", dst_nodata=np.nan,
                  resampling=Resampling.average)
    return Wynik("NMT 1 m GUGiK (uśredniony do 5 m)", {"z": dst, "tr": dtr},
                 url=NMT_WCS, czas_ms=int((time.perf_counter() - t0) * 1000), z_cache=True)
