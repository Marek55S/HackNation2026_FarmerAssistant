"""Pobieracze źródeł (Dodatek A w TODO.md). Każdy zwraca `Wynik` – dane albo jawny brak."""
from __future__ import annotations

import asyncio
import csv
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

import httpx

from . import geo
from .net import Wynik, get

ROOT = Path(__file__).resolve().parents[2]
ULDK = "https://uldk.gugik.gov.pl/"


# ---------- A1. ULDK – działka ----------
def _parse_uldk(text: str, fields: list[str]) -> dict | None:
    lines = [l for l in (text or "").strip().splitlines() if l.strip()]
    if not lines or lines[0].startswith("-1") or len(lines) < 2:
        return None
    vals = lines[1].split("|")
    d = dict(zip(fields, vals))
    rings = geo.parse_wkt(d.get("geom_wkt", ""))
    if not rings:
        return None
    lon, lat = geo.centroid(rings)
    return {
        "id": d.get("id"), "teryt": d.get("teryt"), "wojewodztwo": d.get("voivodeship"), "powiat": d.get("county"),
        "gmina": d.get("commune"), "obreb": d.get("region"), "numer": d.get("parcel"),
        "rings": rings, "lon": lon, "lat": lat, "pow_ha": geo.area_m2(rings) / 10000,
    }


async def dzialka(client: httpx.AsyncClient, ident: str | None = None, lon: float | None = None,
                  lat: float | None = None) -> Wynik:
    fields = ["geom_wkt", "id", "teryt", "voivodeship", "county", "commune", "region", "parcel"]
    if ident:
        params = {"request": "GetParcelById", "id": ident.strip(), "result": ",".join(fields), "srid": "4326"}
    else:
        params = {"request": "GetParcelByXY", "xy": f"{lon},{lat},4326", "result": ",".join(fields), "srid": "4326"}
    w = await get(client, "ULDK GUGiK", ULDK, params, fmt="text", timeout=12)
    if not w.ok:
        return w
    parsed = _parse_uldk(w.dane, fields)
    if not parsed:
        return Wynik(w.zrodlo, None, powod="nie ma takiej działki w obecnej ewidencji — wskaż ją na mapie", url=ULDK,
                     czas_ms=w.czas_ms)
    if not parsed.get("id") and ident:
        parsed["id"] = ident.strip()
    w.dane = parsed
    return w


async def szukaj_obreb(client, obreb: str, numer: str, gmina: str | None = None) -> Wynik:
    """T2.3: ULDK GetParcelByIdOrNr – „{obręb} {numer}” → lista działek (opcjonalny filtr gminy)."""
    fields = ["id", "voivodeship", "county", "commune", "region", "parcel"]
    params = {"request": "GetParcelByIdOrNr", "id": f"{obreb.strip()} {numer.strip()}", "result": ",".join(fields)}
    w = await get(client, "ULDK GUGiK", ULDK, params, fmt="text", timeout=12)
    if not w.ok:
        return w
    lines = [l for l in w.dane.strip().splitlines() if l.strip()]
    if not lines or lines[0].startswith("-1"):
        return Wynik(w.zrodlo, None, powod="nie znaleziono działki o tym obrębie i numerze", czas_ms=w.czas_ms)
    out = []
    for l in lines[1:]:
        v = dict(zip(fields, l.split("|")))
        if gmina and gmina.strip().lower() not in (v.get("commune") or "").lower():
            continue
        out.append({"id": v.get("id"), "wojewodztwo": v.get("voivodeship"), "powiat": v.get("county"),
                    "gmina": v.get("commune"), "obreb": v.get("region"), "numer": v.get("parcel")})
    if not out:
        return Wynik(w.zrodlo, None, powod="w tej gminie nie ma działki o tym obrębie i numerze", czas_ms=w.czas_ms)
    w.dane = out[:20]
    return w


# ---------- A2/A3. Open‑Meteo ----------
METEO_DAILY = ("precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,"
               "soil_moisture_0_to_7cm_mean,soil_moisture_7_to_28cm_mean,soil_moisture_28_to_100cm_mean")


async def meteo_archiwum(client, lat: float, lon: float, d: date, lata: int = 31) -> Wynik:
    """30 lat przed `D` (+ rok zapasu na rozruch bilansu) jednym zapytaniem; siatka zaokrąglona do 0,05° (cache)."""
    end = min(d, date.today() - timedelta(days=1))
    params = {"latitude": round(lat * 20) / 20, "longitude": round(lon * 20) / 20,
              "start_date": date(end.year - lata, 1, 1).isoformat(), "end_date": end.isoformat(),
              "daily": METEO_DAILY, "timezone": "Europe/Warsaw"}
    w = await get(client, "Open‑Meteo (ERA5‑Land)", "https://archive-api.open-meteo.com/v1/archive", params,
                  timeout=30)
    if w.ok and "daily" not in w.dane:
        w.powod, w.dane = "odpowiedź bez danych dobowych", None
    return w


async def meteo_prognoza(client, lat: float, lon: float) -> Wynik:
    params = {"latitude": round(lat, 3), "longitude": round(lon, 3), "forecast_days": 16, "timezone": "Europe/Warsaw",
              "daily": "precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max"}
    return await get(client, "Open‑Meteo (prognoza 16 dni)", "https://api.open-meteo.com/v1/forecast", params,
                     timeout=10, cache=False)


# ---------- A4. IUNG – kategoria gleby i pokrycie terenu ----------
IUNG_WMS = "https://sgeo.iung.pl/geoserver/Susza/wms"


async def _iung_punkt(client, lon, lat) -> int | None:
    e = 0.0005
    params = {"SERVICE": "WMS", "VERSION": "1.1.1", "REQUEST": "GetFeatureInfo",
              "LAYERS": "Susza:katgl_landuse2024", "QUERY_LAYERS": "Susza:katgl_landuse2024", "SRS": "EPSG:4326",
              "BBOX": f"{lon - e},{lat - e},{lon + e},{lat + e}", "WIDTH": 11, "HEIGHT": 11, "X": 5, "Y": 5,
              "INFO_FORMAT": "application/json"}
    w = await get(client, "IUNG", IUNG_WMS, params, timeout=10)
    try:
        return int(w.dane["features"][0]["properties"]["GRAY_INDEX"])
    except Exception:
        return None


async def iung_kategoria(client, rings) -> Wynik:
    import time
    t0 = time.perf_counter()
    pts = geo.grid_points(rings, 4)[:7]
    kody = [k for k in await asyncio.gather(*[_iung_punkt(client, x, y) for x, y in pts]) if k not in (None, 0, 255)]
    ms = int((time.perf_counter() - t0) * 1000)
    if not kody:
        return Wynik("IUNG‑PIB – kategorie gleb", None, powod="brak odpowiedzi lub brak danych dla punktów działki",
                     url=IUNG_WMS, czas_ms=ms)
    gleb = [k for k in kody if 1 <= k <= 5]
    nierol = [k for k in kody if k >= 11]
    dane = {
        "kody": kody,
        "kategoria": Counter([k for k in gleb if k <= 4]).most_common(1)[0][0] if any(k <= 4 for k in gleb) else (5 if gleb else None),
        "udzial_organiczne": sum(1 for k in kody if k == 5) / len(kody),
        "nierolnicza": len(nierol) > len(kody) / 2,
        "nierolnicza_kod": Counter(nierol).most_common(1)[0][0] if nierol else None,
    }
    return Wynik("IUNG‑PIB – kategorie gleb", dane, url=IUNG_WMS, czas_ms=ms)


# ---------- A6. Progi KBW IUNG (CSV) ----------
_PROGI: dict | None = None
OKRESY: list[tuple[str, tuple[int, int], tuple[int, int]]] = []


def progi() -> dict:
    """{(wiersz, kategoria 'I'..'IV'): [próg lub None × 14]}; OKRESY = [(etykieta, start, koniec)]."""
    global _PROGI
    if _PROGI is None:
        with open(ROOT / "dane" / "kbw_progi_iung.csv", encoding="utf-8") as f:
            rows = list(csv.reader(f))
        head = rows[0][2:]
        OKRESY.clear()
        for h in head:
            a, b = h.split("-")
            OKRESY.append((h, (int(a[3:5]), int(a[:2])), (int(b[3:5]), int(b[:2]))))
        _PROGI = {(r[0], r[1]): [float(x) if x.strip() else None for x in r[2:]] for r in rows[1:]}
    return _PROGI


# ---------- A10. ARiMR GSA – uprawy (WFS 2025–2026) ----------
async def arimr_uprawa(client, rings, rok: int, punkt: tuple[float, float] | None = None) -> Wynik:
    """Dominująca uprawa ARiMR w działce; z `punkt` (kliknięcie na mapie) – uprawa pola pod tym punktem."""
    zr = f"ARiMR – deklaracje upraw {rok}"
    if rok not in (2025, 2026):
        return Wynik(zr, None, powod=f"brak usługi WFS dla {rok} (2020–2024: shapefile do przetworzenia – T3.9)")
    x0, y0, x1, y1 = geo.bbox(rings)
    url = f"https://geoportal-w2.arimr.gov.pl/geoserver/gsa_public/uprawy_{rok}/wfs"
    params = {"SERVICE": "WFS", "VERSION": "2.0.0", "REQUEST": "GetFeature",
              "TYPENAMES": f"gsa_public:uprawy_rolne_{rok}", "OUTPUTFORMAT": "application/json", "COUNT": 50,
              "BBOX": f"{y0},{x0},{y1},{x1},urn:ogc:def:crs:EPSG::4326", "SRSNAME": "urn:ogc:def:crs:EPSG::4326"}
    w = await get(client, zr, url, params, timeout=12)
    if not w.ok:
        return w
    pts = geo.grid_points(rings, 14)
    licz: Counter = Counter()
    for f in w.dane.get("features", []):
        g = f.get("geometry") or {}
        polys = g.get("coordinates", [])
        polys = [polys] if g.get("type") == "Polygon" else polys
        frings = [[tuple(p[:2]) for p in poly[0]] for poly in polys if poly]
        # oś: WFS 2.0 w EPSG:4326 bywa (lat, lon) – wykrywamy po zakresie
        if frings and frings[0] and frings[0][0][0] > 40:
            frings = [[(b, a) for a, b in r] for r in frings]
        n = sum(1 for p in pts if geo.inside_any(p, frings))
        if punkt and geo.inside_any(punkt, frings):
            w.dane = {"roslina": f["properties"].get("roslina") or "?", "grupa": f["properties"].get("grupa_roslin") or "",
                      "udzial": 1.0, "inne": [], "pod_punktem": True}
            return w
        if n:
            licz[(f["properties"].get("roslina") or "?", f["properties"].get("grupa_roslin") or "")] += n
    if not licz:
        return Wynik(zr, None, powod="brak deklaracji przecinającej działkę", url=url, czas_ms=w.czas_ms)
    (roslina, grupa), n = licz.most_common(1)[0]
    w.dane = {"roslina": roslina, "grupa": grupa, "udzial": n / len(pts),
              "inne": [r for (r, _), _ in licz.most_common()[1:4]]}
    return w
