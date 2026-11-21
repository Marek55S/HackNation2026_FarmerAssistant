"""Źródła kontekstowe: EDO CDI (P12 → F16, 4. sygnał pewności) i SoilGrids (P5 → F6c, skład gleby).

EDO WMS nie obsługuje GetFeatureInfo, więc pobieramy mały obrazek 9×9 wokół działki (GetMap z TIME = dekada ≤ D)
i odczytujemy kolor środkowego piksela według legendy warstwy `cdiad` (Watch / Warning / Alert).
"""
from __future__ import annotations

import io
import time
from datetime import date, timedelta

import httpx

from .net import Wynik, cache_czytaj, cache_zapisz, get

EDO = "https://drought.emergency.copernicus.eu/api/wms"
CDI_KLASY = [((240, 228, 66), "obserwacja", "spadek opadów (SPI)"),
             ((230, 159, 0), "ostrzeżenie", "opady + wilgotność gleby poniżej normy"),
             ((220, 5, 12), "alarm", "opady, gleba i roślinność (fAPAR) poniżej normy")]


def _dekady(D: date, n: int = 3) -> list[date]:
    d = date(D.year, D.month, 21 if D.day >= 21 else 11 if D.day >= 11 else 1)
    out = []
    for _ in range(n):
        out.append(d)
        prev = d - timedelta(days=1)
        d = date(prev.year, prev.month, 21 if prev.day >= 21 else 11 if prev.day >= 11 else 1)
    return out


async def edo_cdi(client: httpx.AsyncClient, lon: float, lat: float, D: date) -> Wynik:
    from PIL import Image
    t0 = time.perf_counter()
    zr = "EDO – Combined Drought Indicator"
    if D < date(2012, 1, 11):
        return Wynik(zr, None, powod="CDI EDO jest dostępny od 2012 r.")
    klucz = [round(lon, 2), round(lat, 2), D.isoformat()]
    c = cache_czytaj("edo", klucz)
    if c:
        return Wynik(zr, c, url=EDO, z_cache=True)
    for dek in _dekady(D):
        params = {"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetMap", "LAYERS": "cdiad", "STYLES": "",
                  "CRS": "EPSG:4326", "BBOX": f"{lat - 0.05},{lon - 0.05},{lat + 0.05},{lon + 0.05}",
                  "WIDTH": 9, "HEIGHT": 9, "FORMAT": "image/png", "TIME": dek.isoformat()}
        try:
            r = await client.get(EDO, params=params, timeout=15)
            if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image"):
                continue
            px = Image.open(io.BytesIO(r.content)).convert("RGBA").getpixel((4, 4))
        except Exception:  # noqa: BLE001
            continue
        klasa, opis = "brak suszy", "wskaźniki w normie"
        if px[3] > 0:
            best = min(CDI_KLASY, key=lambda k: sum((a - b) ** 2 for a, b in zip(k[0], px[:3])))
            if sum((a - b) ** 2 for a, b in zip(best[0], px[:3])) < 900:
                klasa, opis = best[1], best[2]
        if D < date.today() - timedelta(days=30):      # starsze dekady są już ostateczne
            cache_zapisz("edo", klucz, {"klasa": klasa, "opis": opis, "dekada": dek.isoformat()})
        return Wynik(zr, {"klasa": klasa, "opis": opis, "dekada": dek.isoformat()}, url=EDO,
                     czas_ms=int((time.perf_counter() - t0) * 1000))
    return Wynik(zr, None, powod="EDO nie zwrócił mapy dla tej dekady", url=EDO,
                 czas_ms=int((time.perf_counter() - t0) * 1000))


async def soilgrids(client: httpx.AsyncClient, lon: float, lat: float) -> Wynik:
    """Skład i retencja gleby (A5): tylko 2 głębokości, bo pełne zapytanie trwa 10–14 s. Wynik w cache."""
    params = [("lon", round(lon, 4)), ("lat", round(lat, 4)), ("value", "mean"), ("depth", "5-15cm"), ("depth", "30-60cm")]
    params += [("property", p) for p in ("sand", "clay", "soc", "wv0033", "wv1500")]
    w = await get(client, "ISRIC SoilGrids 250 m", "https://rest.isric.org/soilgrids/v2.0/properties/query",
                  params, timeout=15)
    if not w.ok:
        return w
    try:
        layers = {L["name"]: [d["values"]["mean"] for d in L["depths"]] for L in w.dane["properties"]["layers"]}
    except Exception as e:  # noqa: BLE001
        return Wynik(w.zrodlo, None, powod=f"nieoczekiwana odpowiedź: {e}"[:150], czas_ms=w.czas_ms)
    t0 = time.perf_counter() - w.czas_ms / 1000
    ms = int((time.perf_counter() - t0) * 1000)
    if any(v is None for vals in layers.values() for v in vals):
        return Wynik("ISRIC SoilGrids 250 m", None, powod="brak wartości w tym miejscu (teren zabudowany lub woda)", czas_ms=ms)
    sr = lambda k: sum(layers[k]) / len(layers[k])
    fc, wp = sr("wv0033") / 1000, sr("wv1500") / 1000          # (10⁻² cm³/cm³)·10 → cm³/cm³
    return Wynik("ISRIC SoilGrids 250 m", {
        "piasek": sr("sand") / 10, "il": sr("clay") / 10,      # g/kg·10 → %
        "soc": layers["soc"][0] / 100,                          # dg/kg → % (warstwa 5–15 cm)
        "theta_fc": fc, "theta_wp": wp, "taw_1m": (fc - wp) * 1000,
    }, url="https://soilgrids.org", czas_ms=ms, z_cache=w.z_cache)
