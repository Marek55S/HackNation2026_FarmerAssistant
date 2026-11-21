"""Copernicus Data Space Ecosystem (CDSE).

1. Mapa upraw CLMS HRL VLCC Crop Types 2017–2024 (10 m) – odczyt przez publiczną usługę podglądu (thumbnails WMS)
   z oficjalną paletą (SLD z copernicus-land/colourmaps-legends): kolor piksela → kod klasy. Bez pobierania kafli.
2. Sentinel Hub Process API (OAuth z backend/.env): NDMI Sentinel‑2 L2A od 07.2015 jako mozaika najmniej
   zachmurzonych scen (leastCC) z maską chmur SCL – zdjęcie docelowe i odniesienie z poprzednich lat.
"""
from __future__ import annotations

import asyncio
import io
import os
import time
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import httpx
import numpy as np

from . import geo
from .net import CACHE_DIR, Wynik, cache_czytaj, cache_zapisz
from .satellite import surowe

STAC = "https://stac.dataspace.copernicus.eu/v1/search"
THUMB = "https://thumbnails.dataspace.copernicus.eu/wms"
SLD = ("https://raw.githubusercontent.com/copernicus-land/colourmaps-legends/main/colourmaps/clms_vlcc_crop-types/"
       "clms_vlcc_crop-types_europe_10m_yearly_v1.sld")
TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
PROCESS = "https://sh.dataspace.copernicus.eu/api/v1/process"

# kod klasy CLMS → (nazwa PL, klucz uprawy w aplikacji)
KLASY = {
    1110: ("pszenica", "pszenica"), 1120: ("jęczmień", "jare"), 1130: ("kukurydza", "kukurydza"),
    1140: ("ryż", "inna"), 1150: ("inne zboża", "pszenica"), 1210: ("warzywa", "inna"),
    1220: ("strączkowe", "inna"), 1310: ("ziemniak", "ziemniak"), 1320: ("burak cukrowy", "burak"),
    1410: ("słonecznik", "inna"), 1420: ("soja", "inna"), 1430: ("rzepak", "rzepak"),
    1440: ("len / konopie", "inna"), 2100: ("winorośl", "inna"), 2200: ("oliwki", "inna"),
    2310: ("sady", "inna"), 2320: ("orzechy", "inna"), 3100: ("niesklasyfikowana uprawa", None),
    3200: ("niesklasyfikowana trwała", None), 0: ("poza gruntami ornymi", None),
}
PALETA = {1110: (238, 110, 50), 1120: (251, 162, 74), 1130: (250, 220, 20), 1140: (233, 67, 1), 1150: (232, 169, 149),
          1210: (174, 199, 232), 1220: (72, 151, 191), 1310: (201, 140, 67), 1320: (156, 91, 12), 1410: (255, 121, 121),
          1420: (168, 106, 150), 1430: (227, 119, 194), 1440: (247, 182, 210), 2100: (219, 219, 141), 2200: (193, 206, 18),
          2310: (121, 160, 58), 2320: (90, 124, 48), 3100: (215, 215, 215), 3200: (171, 171, 171), 0: (240, 240, 240)}


def _env() -> dict:
    p = Path(__file__).resolve().parents[1] / ".env"
    out = {k: v for k, v in os.environ.items() if k.startswith("CDSE_")}
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                out.setdefault(k.strip(), v.strip())
    return out


# ---------------------------------------------------------------- 1. mapa upraw 2017–2024
def _klasa(rgb) -> int | None:
    best = min(PALETA.items(), key=lambda kv: sum((a - b) ** 2 for a, b in zip(kv[1], rgb)))
    return best[0] if sum((a - b) ** 2 for a, b in zip(best[1], rgb)) < 300 else None


async def _uprawa_rok(client, item: dict, rings, E0, N0) -> tuple[int, dict | None]:
    from PIL import Image
    from pyproj import Transformer
    rok = int(item["properties"]["datetime"][:4])
    layer = item["assets"]["thumbnail"]["href"].split("LAYERS=")[1].split("&")[0]
    params = {"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": layer, "CRS": "EPSG:3035",
              "BBOX": f"{E0},{N0},{E0 + 2500},{N0 + 2500}", "WIDTH": 250, "HEIGHT": 250, "FORMAT": "image/png",
              "TRANSPARENT": "false", "sld": SLD}
    path = CACHE_DIR / f"cty_{rok}_{E0}_{N0}.png"
    try:
        if path.exists():
            content = path.read_bytes()
        else:
            r = await client.get(THUMB, params=params, timeout=30)
            if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image"):
                return rok, None
            content = r.content
            path.write_bytes(content)
        im = np.asarray(Image.open(io.BytesIO(content)).convert("RGB"))
    except Exception:  # noqa: BLE001
        return rok, None
    # Tylko piksele w prostokącie działki (działka to ułamek kwadratu 2,5 km), transformacja wektorowo.
    fwd = Transformer.from_crs(4326, 3035, always_xy=True)
    inv = Transformer.from_crs(3035, 4326, always_xy=True)
    x0, y0, x1, y1 = geo.bbox(rings)
    ex, ny = fwd.transform([x0, x1, x0, x1], [y0, y0, y1, y1])
    j0, j1 = max(0, int((min(ex) - E0) // 10) - 1), min(250, int((max(ex) - E0) // 10) + 2)
    i0, i1 = max(0, int((N0 + 2500 - max(ny)) // 10) - 1), min(250, int((N0 + 2500 - min(ny)) // 10) + 2)
    licz: Counter = Counter()
    n = 0
    if i1 > i0 and j1 > j0:
        jj, ii = np.meshgrid(np.arange(j0, j1), np.arange(i0, i1))
        lon, lat = inv.transform(E0 + (jj + 0.5) * 10, N0 + 2500 - (ii + 0.5) * 10)
        for i, j, lo, la in zip(ii.ravel(), jj.ravel(), lon.ravel(), lat.ravel()):
            if geo.inside_any((lo, la), rings):
                n += 1
                k = _klasa(tuple(int(x) for x in im[i, j]))
                if k is not None:
                    licz[k] += 1
    if not n or not licz:
        return rok, None
    kod, cnt = licz.most_common(1)[0]
    nazwa, key = KLASY.get(kod, (str(kod), None))
    return rok, {"kod": kod, "nazwa": nazwa, "key": key, "udzial": cnt / n, "pikseli": n}


async def uprawy_clms(client: httpx.AsyncClient, rings, tylko_rok: int | None = None) -> Wynik:
    """Uprawa w każdym roku 2017–2024 wg mapy CLMS (dominanta pikseli 10 m w działce); `tylko_rok` = jeden rok."""
    from pyproj import Transformer
    t0 = time.perf_counter()
    zr = "CLMS Crop Types 2017–2024 (CDSE)"
    x0, y0, x1, y1 = geo.bbox(rings)
    klucz = [round(v, 5) for v in (x0, y0, x1, y1)]
    url_clms = "https://land.copernicus.eu/en/products/high-resolution-layer-croplands"
    for k in ([klucz, None], [klucz, tylko_rok]) if tylko_rok is not None else ([klucz, None],):
        c = cache_czytaj("clms", k)       # mapy 2017–2024 się nie zmieniają – raz odczytane z CDSE wystarczą
        if c:
            dane = {int(r): v for r, v in c.items() if tylko_rok is None or int(r) == tylko_rok}
            if dane:
                return Wynik(zr, dane, url=url_clms, z_cache=True)
    try:
        s = await client.post(STAC, json={"collections": ["clms_vlcc_crop-types_europe_10m_yearly_v1"],
                                          "bbox": [x0, y0, x1, y1], "limit": 20}, timeout=20)
        items = s.json().get("features", [])
    except Exception as e:  # noqa: BLE001
        return Wynik(zr, None, powod=f"katalog CDSE: {type(e).__name__}", czas_ms=int((time.perf_counter() - t0) * 1000))
    if not items:
        return Wynik(zr, None, powod="brak mapy upraw CLMS dla tego miejsca")
    cx, cy = geo.centroid(rings)
    E, N = Transformer.from_crs(4326, 3035, always_xy=True).transform(cx, cy)
    E0, N0 = int(E // 10 * 10) - 1250, int(N // 10 * 10) - 1250
    lata = {}
    for it in items:                       # jeden kafel na rok (pierwszy pasujący)
        lata.setdefault(int(it["properties"]["datetime"][:4]), it)
    if tylko_rok is not None:
        lata = {r: it for r, it in lata.items() if r == tylko_rok}
        if not lata:
            return Wynik(zr, None, powod=f"mapa upraw Copernicus obejmuje 2017–2024 (nie {tylko_rok})")
    wyn = await asyncio.gather(*[_uprawa_rok(client, it, rings, E0, N0) for it in lata.values()])
    dane = {rok: v for rok, v in wyn if v}
    if not dane:
        return Wynik(zr, None, powod="nie udało się odczytać mapy upraw", czas_ms=int((time.perf_counter() - t0) * 1000))
    cache_zapisz("clms", [klucz, tylko_rok], {str(r): v for r, v in dane.items()})
    return Wynik(zr, dane, url=url_clms, czas_ms=int((time.perf_counter() - t0) * 1000))


# ---------------------------------------------------------------- 2. Sentinel Hub – NDMI S2 L2A (od 07.2015)
_TOKEN: dict = {}

EVAL_NDMI = """//VERSION=3
function setup(){return{input:[{bands:["B8A","B11","SCL","dataMask"]}],output:{bands:2,sampleType:"FLOAT32"},mosaicking:"ORBIT"};}
function preProcessScenes(c){return c;}
function evaluatePixel(s){
  for (let i=0;i<s.length;i++){ const x=s[i];
    if (x.dataMask===1 && (x.SCL===4 || x.SCL===5)) { return [(x.B8A-x.B11)/(x.B8A+x.B11), 1]; } }
  return [NaN, 0];
}"""


async def _token(client) -> str | None:
    if _TOKEN.get("exp", 0) > time.time() + 60:
        return _TOKEN["tok"]
    env = _env()
    if not env.get("CDSE_CLIENT_ID"):
        return None
    r = await client.post(TOKEN_URL, data={"grant_type": "client_credentials", "client_id": env["CDSE_CLIENT_ID"],
                                           "client_secret": env["CDSE_CLIENT_SECRET"]}, timeout=20)
    if r.status_code != 200:
        return None
    j = r.json()
    _TOKEN.update(tok=j["access_token"], exp=time.time() + j.get("expires_in", 600))
    return _TOKEN["tok"]


def siatka_20m(rings):
    x0, y0, x1, y1 = geo.bbox(rings)
    lat0 = (y0 + y1) / 2
    rl, rt = 20 / (111320 * np.cos(np.radians(lat0))), 20 / 110574
    w, h = max(2, int((x1 - x0) / rl) + 2), max(2, int((y1 - y0) / rt) + 2)
    return (x0 - rl / 2, y0 - rt / 2, x0 - rl / 2 + w * rl, y0 - rt / 2 + h * rt), w, h


async def ndmi_sh(client, rings, a: date, b: date) -> dict | None:
    """Kompozyt NDMI z najczystszych przelotów (od najnowszego) w oknie [a, b]; siatka 20 m w EPSG:4326."""
    import rasterio
    bb, w, h = siatka_20m(rings)
    key = f"sh_{a.isoformat()}_{b.isoformat()}_{bb[0]:.5f}_{bb[1]:.5f}_{w}_{h}.npz"
    path = CACHE_DIR / key
    if path.exists():
        z = np.load(path)
        return {k: z[k] for k in z.files}
    tok = await _token(client)
    if not tok:
        return None
    body = {"input": {"bounds": {"bbox": list(bb), "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}},
                      "data": [{"type": "sentinel-2-l2a", "dataFilter": {
                          "timeRange": {"from": f"{a.isoformat()}T00:00:00Z", "to": f"{b.isoformat()}T23:59:59Z"},
                          "mosaickingOrder": "leastCC", "maxCloudCoverage": 80}}]},
            "output": {"width": w, "height": h, "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}]},
            "evalscript": EVAL_NDMI}
    r = await client.post(PROCESS, json=body, headers={"Authorization": f"Bearer {tok}"}, timeout=40)
    if r.status_code != 200:
        return None
    with rasterio.MemoryFile(r.content) as mf, mf.open() as ds:
        arr = ds.read()
    ndmi, ok = arr[0], arr[1] > 0.5
    xs = bb[0] + (np.arange(w) + 0.5) * (bb[2] - bb[0]) / w
    ys = bb[3] - (np.arange(h) + 0.5) * (bb[3] - bb[1]) / h
    lon, lat = np.meshgrid(xs, ys)
    inside = np.array([[geo.inside_any((lon[i, j], lat[i, j]), rings) for j in range(w)] for i in range(h)])
    out = {"ndmi": ndmi, "czyste": ok & np.isfinite(ndmi), "inside": inside, "lon": lon, "lat": lat}
    np.savez_compressed(path, **out)
    return out


async def ndmi_anomalia_sh(client, rings, D: date, okno: tuple[date, date]) -> Wynik:
    """NDMI docelowe = kompozyt z ostatnich 20 dni okna (≤ D); odniesienie = te same dni w latach od 2015."""
    t0 = time.perf_counter()
    zr = "Sentinel‑2 L2A – Sentinel Hub (CDSE)"
    a, b = okno
    b = min(b, D)
    if b < date(2015, 7, 15):
        return Wynik(zr, None, powod="Sentinel‑2 nad Polską od 07.2015")
    ostatnie = []
    try:
        koniec = b
        while koniec >= a and len(ostatnie) < 3:           # okno 20 dni, cofamy się, aż działka będzie czysta
            pocz = max(a, koniec - timedelta(days=19))
            r = await ndmi_sh(client, rings, pocz, koniec)
            if r is None and not _TOKEN:
                return Wynik(zr, None, powod="brak dostępu do Sentinel Hub (token CDSE)")
            if r is not None and r["inside"].sum() and (r["czyste"] & r["inside"]).sum() / r["inside"].sum() >= 0.6:
                ostatnie.append((pocz, koniec, r))
                break
            koniec = pocz - timedelta(days=1)
        if not ostatnie:
            return Wynik(zr, None, powod="brak czystego kompozytu Sentinel‑2 w tym okresie",
                         czas_ms=int((time.perf_counter() - t0) * 1000))
        pocz, koniec, r = ostatnie[0]
        lata = [y for y in range(koniec.year - 1, 2014, -1)][:9]
        okna = [(pocz.replace(year=y), koniec.replace(year=y)) for y in lata
                if koniec.replace(year=y) >= date(2015, 7, 15)]
        refs = await asyncio.gather(*[ndmi_sh(client, rings, p, k) for p, k in okna], return_exceptions=True)
        refs_ok = [(okna[i][0].year, x) for i, x in enumerate(refs)
                   if isinstance(x, dict) and x["inside"].sum() and (x["czyste"] & x["inside"]).sum() / x["inside"].sum() >= 0.5]
    except Exception as e:  # noqa: BLE001
        return Wynik(zr, None, powod=f"{type(e).__name__}: {e}"[:200], czas_ms=int((time.perf_counter() - t0) * 1000))
    meta = {"data": koniec.isoformat(), "okres": f"{pocz:%d.%m}–{koniec:%d.%m.%Y}", "chmury": 0.0, "kafel": "kompozyt leastCC",
            "piksel_m": 20, "sensor": "Sentinel‑2 (Sentinel Hub, kompozyt)"}
    return surowe(zr, r, refs_ok, meta, min_px=2, px_ha=0.04, url="https://dataspace.copernicus.eu",
                  czas_ms=int((time.perf_counter() - t0) * 1000))
