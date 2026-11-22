"""Satelita (P10 → F10, F10b): wilgotność roślin NDMI z Sentinel‑2 L2A (Microsoft Planetary Computer, bez konta).

- scena docelowa: ostatnia czysta scena ≤ D w okresie wegetacji uprawy; poza wegetacją – ostatnia czysta scena
  z okna wrażliwości minionego sezonu (spadek NDMI po zbiorze to nie susza – METODY §1.5);
- odniesienie: ten sam kafel MGRS, ±12 dni od daty sceny w poprzednich latach (2016+, ten sam sensor);
- wynik: z‑score NDMI per piksel (20 m) → najsuchsza strefa (z < −1) i mediana z w działce.
Lata < 2016 (Landsat) – jeszcze nie (T3.8).
"""
from __future__ import annotations

import asyncio
import hashlib
import time
from datetime import date, timedelta

import httpx
import numpy as np

from . import geo
from .net import CACHE_DIR, Wynik, powod_bledu

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a"
Z_SUCHO = -1.0      # ⚙️ próg „dużo suszej niż zwykle”
MIN_CZYSTE = 0.6    # udział czystych pikseli działki


async def _szukaj(client, geom, a: date, b: date, limit=12, tile=None):
    body = {"collections": ["sentinel-2-l2a"], "intersects": geom, "datetime": f"{a.isoformat()}/{b.isoformat()}",
            "query": {"eo:cloud_cover": {"lt": 60}}, "sortby": [{"field": "datetime", "direction": "desc"}], "limit": limit}
    if tile:
        body["query"]["s2:mgrs_tile"] = {"eq": tile}
    r = await client.post(STAC, json=body, timeout=20)
    r.raise_for_status()
    return r.json().get("features", [])


def _czytaj(item: dict, token: str, rings) -> dict | None:
    """Odczyt okna działki: NDMI (20 m) + maska czystych pikseli w działce. Wynik w cache (.npz)."""
    import rasterio
    from pyproj import Transformer
    from rasterio.windows import from_bounds
    x0, y0, x1, y1 = geo.bbox(rings)
    key = hashlib.sha1(f"{item['id']}|{x0:.5f}|{y0:.5f}|{x1:.5f}|{y1:.5f}".encode()).hexdigest()
    path = CACHE_DIR / f"s2_{key}.npz"
    if path.exists():
        z = np.load(path)
        return {k: z[k] for k in z.files}
    href = lambda b: item["assets"][b]["href"] + "?" + token
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="20"):
        with rasterio.open(href("B8A")) as ds:
            tr = Transformer.from_crs(4326, ds.crs, always_xy=True)
            xs, ys = tr.transform([x0, x1, x0, x1], [y0, y0, y1, y1])
            win = from_bounds(min(xs) - 20, min(ys) - 20, max(xs) + 20, max(ys) + 20, ds.transform).round_offsets().round_lengths()
            nir = ds.read(1, window=win).astype(float)
            wtr = ds.window_transform(win)
            crs = ds.crs
        with rasterio.open(href("B11")) as ds:
            swir = ds.read(1, window=win).astype(float)
        with rasterio.open(href("SCL")) as ds:
            scl = ds.read(1, window=win)
    base = float(item["properties"].get("s2:processing_baseline", "0") or 0)
    off = 1000.0 if base >= 4.0 else 0.0
    nir, swir = nir - off, swir - off
    with np.errstate(invalid="ignore", divide="ignore"):
        ndmi = (nir - swir) / (nir + swir)
    h, w = ndmi.shape
    inv = Transformer.from_crs(crs, 4326, always_xy=True)
    cols, rows = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    X = wtr.c + wtr.a * cols
    Y = wtr.f + wtr.e * rows
    lon, lat = inv.transform(X, Y)
    inside = np.array([[geo.inside_any((lon[i, j], lat[i, j]), rings) for j in range(w)] for i in range(h)])
    czyste = np.isin(scl, [4, 5]) & np.isfinite(ndmi)
    out = {"ndmi": ndmi, "czyste": czyste, "inside": inside, "lon": lon, "lat": lat}
    np.savez_compressed(path, **out)
    return out


def _udzial_czystych(r: dict) -> float:
    n = r["inside"].sum()
    return float((r["czyste"] & r["inside"]).sum() / n) if n else 0.0


MIN_LAT_REF = 3


def surowe(zr: str, r: dict, refs: list[tuple[int, dict]], meta: dict, *, min_px: int, px_ha: float,
           url: str | None, czas_ms: int) -> Wynik:
    """Wynik pobrania: scena docelowa + sceny odniesienia z rokiem. Anomalię liczy `anomalia` – dopiero gdy wiadomo,
    co rosło w latach odniesienia (pobieranie idzie równolegle z historią upraw)."""
    if len(refs) < MIN_LAT_REF:
        return Wynik(zr, None, powod=f"za mało czystych zdjęć z poprzednich lat do porównania ({len(refs)} < {MIN_LAT_REF})",
                     url=url, czas_ms=czas_ms)
    return Wynik(zr, {"r": r, "refs": refs, "meta": meta, "min_px": min_px, "px_ha": px_ha}, url=url, czas_ms=czas_ms)


def anomalia(w: Wynik, lata_ok: set[int] | None = None, powod_braku_lat: str | None = None) -> Wynik:
    """z‑score NDMI per piksel względem scen odniesienia; `lata_ok` – tylko lata z tą samą grupą łanu (L1).
    Przy < 3 latach nie liczymy (bez pozornej precyzji) i mówimy dlaczego."""
    if not w.ok:
        return w
    s = w.dane
    r, meta = s["r"], s["meta"]
    refs = [(y, x) for y, x in s["refs"] if lata_ok is None or y in lata_ok]
    if len(refs) < MIN_LAT_REF:
        powod = powod_braku_lat or (f"za mało sezonów z tą samą grupą upraw do porównania ({len(refs)} < {MIN_LAT_REF}; "
                                    f"zdjęcia z lat {', '.join(str(y) for y, _ in sorted(s['refs']))})")
        return Wynik(w.zrodlo, None, powod=powod, url=w.url, czas_ms=w.czas_ms, pobrano=w.pobrano)
    stack = np.stack([np.where(x["czyste"], x["ndmi"], np.nan) for _, x in refs])
    mu, sd = np.nanmean(stack, 0), np.maximum(np.nanstd(stack, 0), 0.03)
    with np.errstate(invalid="ignore"):
        z = (r["ndmi"] - mu) / sd
    ok = r["inside"] & r["czyste"] & (np.isfinite(stack).sum(0) >= MIN_LAT_REF) & np.isfinite(z)
    if ok.sum() < s["min_px"]:
        return Wynik(w.zrodlo, None, powod="za mało porównywalnych pikseli w działce", url=w.url, czas_ms=w.czas_ms,
                     pobrano=w.pobrano)
    sucho = ok & (z < Z_SUCHO)
    sl = [(float(r["lon"][i, j]), float(r["lat"][i, j])) for i, j in zip(*np.nonzero(sucho))]
    return Wynik(w.zrodlo, meta | {
        "lata_ref": sorted(y for y, _ in refs), "n_ref": len(refs), "z_med": float(np.median(z[ok])),
        "ndmi_med": float(np.nanmedian(r["ndmi"][ok])), "sucho_ha": float(sucho.sum() * s["px_ha"]),
        "sucho_udzial": float(sucho.sum() / ok.sum()),
        "sucho_srodek": (float(np.mean([p[0] for p in sl])), float(np.mean([p[1] for p in sl]))) if sl else None,
        "piksele": [(float(r["lon"][i, j]), float(r["lat"][i, j]), round(float(z[i, j]), 2)) for i, j in zip(*np.nonzero(ok))],
    }, url=w.url, czas_ms=w.czas_ms, pobrano=w.pobrano)


async def ndmi_anomalia(client: httpx.AsyncClient, rings, D: date, okno: tuple[date, date] | None) -> Wynik:
    """`okno` = (od, do) okresu, z którego bierzemy scenę docelową (≤ D)."""
    t0 = time.perf_counter()
    zr = "Sentinel‑2 L2A (Planetary Computer)"
    if D < date(2016, 6, 1) or okno is None:
        return Wynik(zr, None, powod="dla lat przed 2016 potrzebny Landsat — jeszcze niepodpięty")
    geom = {"type": "Polygon", "coordinates": [[list(p) for p in rings[0]]]}
    try:
        tok = (await client.get(TOKEN, timeout=15)).json()["token"]
        a, b = okno
        items = await _szukaj(client, geom, a, min(b, D), limit=8)
        if not items:
            return Wynik(zr, None, powod=f"brak zdjęć ≤ 60% chmur w okresie {a:%d.%m}–{min(b, D):%d.%m.%Y}",
                         czas_ms=int((time.perf_counter() - t0) * 1000))
        cel = None
        for it in items[:4]:                       # od najnowszej: pierwsza z ≥ 60% czystych pikseli działki
            r = await asyncio.to_thread(_czytaj, it, tok, rings)
            if r is not None and _udzial_czystych(r) >= MIN_CZYSTE:
                cel = (it, r)
                break
        if not cel:
            return Wynik(zr, None, powod="brak bezchmurnego zdjęcia działki w tym okresie",
                         czas_ms=int((time.perf_counter() - t0) * 1000))
        it, r = cel
        dsc = date.fromisoformat(it["properties"]["datetime"][:10])
        tile = it["properties"].get("s2:mgrs_tile")
        # odniesienie: te same dni roku w poprzednich latach (2016+), ten sam kafel
        lata = [y for y in range(dsc.year - 1, 2015, -1)][:8]
        szuk = [_szukaj(client, geom, date(y, dsc.month, dsc.day) - timedelta(days=12),
                        date(y, dsc.month, dsc.day) + timedelta(days=12), limit=4, tile=tile) for y in lata]
        wyniki = await asyncio.gather(*szuk, return_exceptions=True)
        kand = [sorted(w, key=lambda f: f["properties"]["eo:cloud_cover"])[0] for w in wyniki if isinstance(w, list) and w]
        wyn = await asyncio.gather(*[asyncio.to_thread(_czytaj, k, tok, rings) for k in kand], return_exceptions=True)
        refs = [(int(k["properties"]["datetime"][:4]), x) for k, x in zip(kand, wyn)
                if isinstance(x, dict) and x["ndmi"].shape == r["ndmi"].shape and _udzial_czystych(x) >= 0.5]
    except Exception as e:  # noqa: BLE001
        return Wynik(zr, None, powod=powod_bledu(e), url=STAC, czas_ms=int((time.perf_counter() - t0) * 1000))
    meta = {"data": dsc.isoformat(), "chmury": float(it["properties"]["eo:cloud_cover"]), "kafel": tile,
            "piksel_m": 20, "sensor": "Sentinel‑2 (Planetary Computer)"}
    return surowe(zr, r, refs, meta, min_px=3, px_ha=0.04,
                  url="https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a",
                  czas_ms=int((time.perf_counter() - t0) * 1000))


# ---------------------------------------------------------------- Landsat 5/7/8/9 (lata < 2016 i zapas dla S2)
LS_TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/landsat-c2-l2"
LS_PLATFORMY = ["landsat-5", "landsat-7", "landsat-8", "landsat-9"]


def _siatka(rings, res_lon=0.00045, res_lat=0.00027):
    """Wspólna siatka EPSG:4326 (~30 m) nad działką – te same piksele dla każdej sceny i sensora."""
    from rasterio.transform import from_origin
    x0, y0, x1, y1 = geo.bbox(rings)
    w = max(2, int((x1 - x0) / res_lon) + 2)
    h = max(2, int((y1 - y0) / res_lat) + 2)
    return from_origin(x0 - res_lon / 2, y1 + res_lat / 2, res_lon, res_lat), w, h


def _czytaj_ls(item: dict, token: str, rings) -> dict | None:
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.vrt import WarpedVRT
    tr, w, h = _siatka(rings)
    key = hashlib.sha1(f"{item['id']}|{tr.c:.5f}|{tr.f:.5f}|{w}|{h}".encode()).hexdigest()
    path = CACHE_DIR / f"ls_{key}.npz"
    if path.exists():
        z = np.load(path)
        return {k: z[k] for k in z.files}
    out = {}
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_TIMEOUT="20"):
        for b in ("nir08", "swir16", "qa_pixel"):
            with rasterio.open(item["assets"][b]["href"] + "?" + token) as ds:
                with WarpedVRT(ds, crs="EPSG:4326", transform=tr, width=w, height=h,
                               resampling=Resampling.nearest) as v:
                    out[b] = v.read(1)
    qa = out["qa_pixel"].astype(np.int64)
    czyste = ((qa & 0b1) == 0) & ((qa >> 1 & 1) == 0) & ((qa >> 3 & 1) == 0) & ((qa >> 4 & 1) == 0) \
        & ((qa >> 5 & 1) == 0) & ((qa >> 7 & 1) == 0) & (qa > 0)
    nir = out["nir08"] * 0.0000275 - 0.2
    sw = out["swir16"] * 0.0000275 - 0.2
    with np.errstate(invalid="ignore", divide="ignore"):
        ndmi = (nir - sw) / (nir + sw)
    cols, rows = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
    lon, lat = tr.c + tr.a * cols, tr.f + tr.e * rows
    inside = np.array([[geo.inside_any((lon[i, j], lat[i, j]), rings) for j in range(w)] for i in range(h)])
    res = {"ndmi": ndmi, "czyste": czyste & np.isfinite(ndmi), "inside": inside, "lon": lon, "lat": lat}
    np.savez_compressed(path, **res)
    return res


async def _szukaj_ls(client, geom, a: date, b: date, limit=8):
    body = {"collections": ["landsat-c2-l2"], "intersects": geom, "datetime": f"{a.isoformat()}/{b.isoformat()}",
            "query": {"eo:cloud_cover": {"lt": 70}, "platform": {"in": LS_PLATFORMY}},
            "sortby": [{"field": "datetime", "direction": "desc"}], "limit": limit}
    r = await client.post(STAC, json=body, timeout=20)
    r.raise_for_status()
    return r.json().get("features", [])


async def ndmi_landsat(client: httpx.AsyncClient, rings, D: date, okno: tuple[date, date]) -> Wynik:
    """To samo co `ndmi_anomalia`, ale na Landsacie (30 m) – dla dat sprzed 2016 r. lub gdy S2 ma za mało lat."""
    t0 = time.perf_counter()
    zr = "Landsat 5/7/8/9 C2 L2 (Planetary Computer)"
    geom = {"type": "Polygon", "coordinates": [[list(p) for p in rings[0]]]}
    try:
        tok = (await client.get(LS_TOKEN, timeout=15)).json()["token"]
        a, b = okno
        items = await _szukaj_ls(client, geom, a, min(b, D), limit=12)
        cel = None
        for it in items[:8]:
            r = await asyncio.to_thread(_czytaj_ls, it, tok, rings)
            if r is not None and _udzial_czystych(r) >= 0.5:
                cel = (it, r)
                break
        if not cel:
            return Wynik(zr, None, powod="brak bezchmurnego zdjęcia Landsat działki w tym okresie",
                         czas_ms=int((time.perf_counter() - t0) * 1000))
        it, r = cel
        dsc = date.fromisoformat(it["properties"]["datetime"][:10])
        lata = list(range(dsc.year - 1, max(1999, dsc.year - 11), -1))
        szuk = [_szukaj_ls(client, geom, date(y, dsc.month, min(dsc.day, 28)) - timedelta(days=20),
                           date(y, dsc.month, min(dsc.day, 28)) + timedelta(days=20), limit=6) for y in lata]
        wyniki = await asyncio.gather(*szuk, return_exceptions=True)
        # anomalia w obrębie jednej rodziny czujników (METODY §1.5): TM/ETM+ (L5, L7) albo OLI (L8, L9)
        oli = it["properties"]["platform"] in ("landsat-8", "landsat-9")
        rodzina = lambda f: (f["properties"]["platform"] in ("landsat-8", "landsat-9")) == oli
        kand = [sorted([f for f in w if rodzina(f)], key=lambda f: f["properties"]["eo:cloud_cover"])[:2]
                for w in wyniki if isinstance(w, list) and w]
        kand = [k for grp in kand for k in grp]
        refs = await asyncio.gather(*[asyncio.to_thread(_czytaj_ls, k, tok, rings) for k in kand], return_exceptions=True)
        para = [(k, x) for k, x in zip(kand, refs) if isinstance(x, dict) and _udzial_czystych(x) >= 0.5]
        widziane, refs = set(), []
        for k, x in para:                     # najwyżej jedna scena na rok
            y = int(k["properties"]["datetime"][:4])
            if y not in widziane:
                widziane.add(y)
                refs.append((y, x))
    except Exception as e:  # noqa: BLE001
        return Wynik(zr, None, powod=powod_bledu(e), czas_ms=int((time.perf_counter() - t0) * 1000))
    meta = {"data": dsc.isoformat(), "chmury": float(it["properties"]["eo:cloud_cover"]), "kafel": it["properties"]["platform"],
            "piksel_m": 30, "sensor": "Landsat " + ("8/9 (OLI)" if oli else "5/7 (TM/ETM+)")}
    return surowe(zr, r, refs, meta, min_px=2, px_ha=0.09,
                  url="https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2",
                  czas_ms=int((time.perf_counter() - t0) * 1000))
