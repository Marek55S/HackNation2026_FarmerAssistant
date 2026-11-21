"""Dane hydrologiczne (L3 w TODO_LUKI.md): zlewnia z MPHP10k (Wody Polskie), wodowskazy i ostrzeżenia IMGW‑PIB.

Każda dana ma zmieniać fakt albo zalecenie (R1 – zlewnia rowu, R7/R8 – ostrzeżenie o suszy hydrologicznej),
a nie tylko wisieć w raporcie. Stany rzek i ostrzeżenia są bieżące – dla dat archiwalnych raport mówi to wprost.
"""
from __future__ import annotations

import math
from datetime import date, datetime

import httpx

from . import geo
from .net import Wynik, get

MPHP_WMS = "https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_HY_10k_2019_WMS"
IMGW_HYDRO = "https://danepubliczne.imgw.pl/api/data/hydro/"
IMGW_OSTRZ = "https://danepubliczne.imgw.pl/api/data/warningshydro"
TTL_IMGW_S = 30 * 60          # ⚙️ dane bieżące: jedna lista na cały kraj, odświeżana co 30 min
PROMIEN_KM = 30.0             # ⚙️ wodowskaz dalej niż 30 km nie mówi nic o cieku przy działce


def _km(lon1, lat1, lon2, lat2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def _liczba(x) -> float | None:
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- MPHP10k – zlewnia elementarna
def zlewnia_z_json(dane: dict) -> dict | None:
    """GetFeatureInfo (JSON, EPSG:4326, lon/lat) → nazwa, id i powierzchnia zlewni."""
    feats = (dane or {}).get("features") or []
    if not feats:
        return None
    f = feats[0]
    pr, g = f.get("properties") or {}, f.get("geometry") or {}
    if g.get("type") == "Polygon":
        rings = [g["coordinates"][0]]
    elif g.get("type") == "MultiPolygon":
        rings = [p[0] for p in g["coordinates"]]
    else:
        rings = []
    pow_km2 = geo.area_m2([[tuple(p[:2]) for p in r] for r in rings]) / 1e6 if rings else None
    return {"nazwa": pr.get("gn_spelling") or "", "id": pr.get("hy_localid") or pr.get("id_localid"),
            "pow_km2": pow_km2}


async def zlewnia(client: httpx.AsyncClient, lon: float, lat: float) -> Wynik:
    zr = "MPHP10k – zlewnie (Wody Polskie)"
    d = 0.01
    params = {"SERVICE": "WMS", "VERSION": "1.3.0", "REQUEST": "GetFeatureInfo", "LAYERS": "HY.PhysicalWaters.Catchments",
              "QUERY_LAYERS": "HY.PhysicalWaters.Catchments", "CRS": "EPSG:4326", "STYLES": "",
              "BBOX": f"{lat - d:.5f},{lon - d:.5f},{lat + d:.5f},{lon + d:.5f}", "WIDTH": 101, "HEIGHT": 101,
              "I": 50, "J": 50, "INFO_FORMAT": "application/json", "FEATURE_COUNT": 1}
    w = await get(client, zr, MPHP_WMS, params, timeout=12, retries=1)   # zlewnie się nie zmieniają → cache bez terminu
    if not w.ok:
        return w
    z = zlewnia_z_json(w.dane)
    if not z:
        return Wynik(zr, None, powod="punkt działki poza zlewniami MPHP", url=MPHP_WMS, czas_ms=w.czas_ms)
    return Wynik(zr, z, url=MPHP_WMS, czas_ms=w.czas_ms, z_cache=w.z_cache, pobrano=w.pobrano)


# ---------------------------------------------------------------- IMGW – wodowskazy (stan bieżący)
def stacje_w_poblizu(lista: list[dict], lon: float, lat: float, promien_km: float = PROMIEN_KM, n: int = 5) -> list[dict]:
    out = []
    for s in lista or []:
        slon, slat = _liczba(s.get("lon")), _liczba(s.get("lat"))
        if slon is None or slat is None:
            continue
        km = _km(lon, lat, slon, slat)
        if km <= promien_km:
            out.append({"stacja": s.get("stacja"), "rzeka": s.get("rzeka") or "", "dist_km": km,
                        "stan_cm": _liczba(s.get("stan_wody")), "data": s.get("stan_wody_data_pomiaru"),
                        "ostrzegawczy_cm": _liczba(s.get("stan_ostrzegawczy")), "alarmowy_cm": _liczba(s.get("stan_alarmowy")),
                        "przeplyw": _liczba(s.get("przeplyw")), "przeplyw_data": s.get("przeplyw_data")})
    return sorted(out, key=lambda x: x["dist_km"])[:n]


def wybierz_stacje(stacje: list[dict], rzeka: str | None) -> dict | None:
    """Stacja na tym samym cieku co najbliższa rzeka z BDOT10k, inaczej najbliższa."""
    if not stacje:
        return None
    if rzeka:
        r = rzeka.lower().split()[0]
        same = [s for s in stacje if s["rzeka"] and s["rzeka"].lower().startswith(r)]
        if same:
            return same[0]
    return stacje[0]


async def wodowskazy(client: httpx.AsyncClient, lon: float, lat: float) -> Wynik:
    zr = "IMGW‑PIB – stany wód (bieżące)"
    w = await get(client, zr, IMGW_HYDRO, timeout=10, ttl_s=TTL_IMGW_S)
    if not w.ok:
        return w
    st = stacje_w_poblizu(w.dane, lon, lat)
    if not st:
        return Wynik(zr, None, powod=f"brak wodowskazu IMGW w promieniu {PROMIEN_KM:.0f} km", url=IMGW_HYDRO, czas_ms=w.czas_ms)
    return Wynik(zr, st, url=IMGW_HYDRO, czas_ms=w.czas_ms, z_cache=w.z_cache, pobrano=w.pobrano)


# ---------------------------------------------------------------- IMGW – ostrzeżenia o suszy hydrologicznej
def ostrzezenia_dla(lista: list[dict], wojewodztwo: str, teraz: datetime) -> list[dict]:
    """Aktywne ostrzeżenia „Susza hydrologiczna” dla województwa działki (decyzja 21.11: dopasowanie po województwie,
    bo nie znaleźliśmy publicznej warstwy zlewni prognostycznych IMGW). Dotyczą regionu, nie konkretnego cieku."""
    woj = (wojewodztwo or "").lower().strip()
    out = []
    for o in lista or []:
        if "susza" not in (o.get("zdarzenie") or "").lower():
            continue
        try:
            od = datetime.fromisoformat(o["data_od"])
            do = datetime.fromisoformat(o["data_do"])
        except (KeyError, TypeError, ValueError):
            continue
        if not od <= teraz <= do:
            continue
        obsz = [a for a in o.get("obszary") or [] if (a.get("wojewodztwo") or "").lower().strip() == woj]
        if obsz:
            out.append({"opis": "; ".join(a.get("opis", "") for a in obsz), "przebieg": o.get("przebieg") or "",
                        "od": od.date().isoformat(), "numer": o.get("numer"), "biuro": o.get("biuro") or "",
                        "prawdopodobienstwo": _liczba(o.get("prawdopodobienstwo"))})
    return out


async def ostrzezenia_susza(client: httpx.AsyncClient, wojewodztwo: str) -> Wynik:
    zr = "IMGW‑PIB – ostrzeżenia hydrologiczne"
    w = await get(client, zr, IMGW_OSTRZ, timeout=10, ttl_s=TTL_IMGW_S)
    if not w.ok:
        return w
    return Wynik(zr, ostrzezenia_dla(w.dane, wojewodztwo, datetime.now()), url=IMGW_OSTRZ, czas_ms=w.czas_ms,
                 z_cache=w.z_cache, pobrano=w.pobrano)


def biezace(D: date, dzis: date) -> bool:
    """Stany rzek i ostrzeżenia mają sens tylko dla analizy na dziś (najwyżej 2 dni wstecz)."""
    return (dzis - D).days <= 2
