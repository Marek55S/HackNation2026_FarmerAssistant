"""Analiza działki: dane → fakty → diagnoza → reguły → raport (JSON dla frontendu).

Elementy jeszcze niepodpięte (teren, rowy, satelita, EDO, SoilGrids) są zwracane z `mock: True`
i danymi przykładowymi z makiety – frontend oznacza je etykietą „MOCK”.
"""
from __future__ import annotations

import asyncio
import math
import time
from collections import Counter
from datetime import date, timedelta

import httpx
import numpy as np

from . import config as C
from . import bdot, cdse, context, czesci, geo, hydro, satellite, sources, terrain
from .net import Wynik, powod_czytelny
from .crops import UPRAWY, Uprawa, grupa, kc_dnia, koniec_wegetacji, w_oknie, z_arimr
from .facts import (MIES, Meteo, Plan, bilans, ocena_kbw_teraz, odplyw, s_cn, scenariusze, sezon_kbw, _shift)

NIEROLNE = {11: "las", 12: "woda", 13: "zabudowa", 14: "drogi / nieużytki", 19: "teren niesklasyfikowany",
            99: "teren niesklasyfikowany"}
KAT_OPIS = {1: "I – bardzo podatna (piaski)", 2: "II – podatna (piaski gliniaste)", 3: "III – średnio podatna",
            4: "IV – mało podatna", 5: "gleba organiczna"}


def fmt(x: float, nd: int = 0) -> str:
    s = f"{x:,.{nd}f}".replace(",", " ").replace(".", ",")
    return s


MIES_W = {"kwi": "w kwietniu", "maj": "w maju", "cze": "w czerwcu", "lip": "w lipcu", "sie": "w sierpniu", "wrz": "we wrześniu"}


def mies_w(col: str) -> str:
    """Etykieta kolumny ryzyka w zdaniu: „w sierpniu” albo „do 22.07”."""
    return MIES_W.get(col, col)


def dni(n: int) -> str:
    return f"{n} dzień" if n == 1 else f"{n} dni"


MIES_MIEJSC = ["styczniu", "lutym", "marcu", "kwietniu", "maju", "czerwcu", "lipcu", "sierpniu", "wrześniu",
               "październiku", "listopadzie", "grudniu"]


def plan_efekt(base: dict, plan_s: dict, u: Uprawa, Nn: int, ids: set[str]) -> str:
    """Co zmienia plan w scenariuszach – w mm i dniach stresu; gdy ryzyka nie usuwa, mówi to wprost (L4, 3.3 pkt 5)."""
    if not base.get("dostepny"):
        return "Scenariusze niedostępne."
    if max(base["ryzyko"]) == 0:
        return f"W żadnym z {Nn} scenariuszy nie pojawia się stres wodny w tym okresie — wody powinno wystarczyć."
    i = int(np.argmax(base["ryzyko"]))
    col, r = base["kolumny"][i], base["ryzyko"][i]
    txt = (f"Bez działań: stres {mies_w(col)} w {r} z {Nn} scenariuszy, brak ok. {_r5(base['brak_med'])} mm wody "
           f"w oknie wrażliwym (w suchym roku {_r5(base['brak_p80'])} mm).")
    if plan_s is base or not plan_s.get("dostepny"):
        return txt + " Zalecenia z tego raportu nie zmieniają bilansu wody w scenariuszach (działają poza nim, np. retencja w rowie)."
    rp = plan_s["ryzyko"][i]
    d_mm = max(0.0, base["brak_med"] - plan_s["brak_med"])
    d_dni = max(0.0, base["dni_stresu_sr"] - plan_s["dni_stresu_sr"])
    zysk = f"ok. {fmt(d_mm)} mm mniej brakującej wody i średnio {fmt(d_dni, 1)} dnia stresu mniej"
    if rp < r:
        return txt + f" Z planem: {rp} z {Nn}; {zysk}."
    txt += f" Z planem ryzyko {mies_w(col)} zostaje ({rp} z {Nn}): {zysk}, ale niedoboru na tej glebie to nie usuwa."
    if col in MIES:                                      # kolumny miesięczne (poza sezonem)
        mth = MIES.index(col) + 1
        if not u.okno[0][0] <= mth <= u.okno[1][0]:
            txt += f" Ten stres przypada poza oknem wrażliwym uprawy ({u.okno_opis}), więc mniej szkodzi plonowi."
    dalej = [t for k, t in (("R8", "nawadnianie w oknie wrażliwym"), ("R9", "inna uprawa w płodozmianie")) if k in ids]
    if dalej:
        txt += " Ryzyko może zmniejszyć " + " albo ".join(dalej) + "."
    return txt


def _r5(x: float) -> int:
    return int(5 * round(x / 5))


# ---------------------------------------------------------------- dane wejściowe działki
async def znajdz_dzialke(ident: str | None, lon: float | None, lat: float | None, D: date) -> dict:
    async with httpx.AsyncClient() as client:
        w = await sources.dzialka(client, ident, lon, lat)
        if not w.ok:
            return {"ok": False, "powod": w.powod, "zrodla": [w.opis()]}
        d = w.dane
        if not terrain.nmt_gotowy(d["rings"]):
            asyncio.get_running_loop().run_in_executor(None, terrain.pobierz_nmt, d["rings"])
        # Karta działki: IUNG + podział na uprawy. ARiMR/CLMS woła sam czesci_dzialki — osobne arimr_uprawa
        # i uprawy_clms dublowały te same requesty i w budżecie 7 s często obcinały właśnie podział.
        wi, cz = await asyncio.gather(
            _w_czasie(sources.iung_kategoria(client, d["rings"]), "IUNG‑PIB – kategorie gleb"),
            _w_czasie(czesci.czesci_dzialki(client, d["rings"], D.year), "Podział działki na uprawy"))
    czesci_lista = list(cz.dane or [])
    # Timeout / błąd podziału nie może zostawić pustej karty — jedna część „brak uprawy”, rolnik idzie dalej.
    if not czesci_lista:
        ha_dz = float(d.get("pow_ha") or 0)
        czesci_lista = [{"id": "c1", "uprawa": "brak", "nazwa": "Brak uprawy", "roslina": None,
                         "ha": round(ha_dz, 3), "udzial": 1.0, "geometria": None,
                         "zrodlo": f"podział niedostępny ({cz.powod or 'timeout'}) — przyjęto brak uprawy; możesz zmienić",
                         "pewne": False, "reczna": False}]
    # Deklaracja / mapa na działce = grunt rolny, nawet gdy IUNG widzi las.
    zadeklarowana = any(c.get("uprawa") and c["uprawa"] != "brak" for c in czesci_lista)
    kod = wi.dane["nierolnicza_kod"] if wi.ok and wi.dane["nierolnicza"] and not zadeklarowana else None
    pokrycie = {11: "las", 12: "woda", 13: "zabudowa", 14: "drogi"}.get(kod, "drogi") if kod else (
        "organiczna" if wi.ok and wi.dane["kategoria"] == 5 else "rolny")
    # Podpowiedź = największa część z rozpoznaną uprawą (bez „brak”).
    sug = None
    for c in sorted((x for x in czesci_lista if x.get("uprawa") and x["uprawa"] != "brak"), key=lambda x: -x.get("ha", 0)):
        key = c["uprawa"]
        if key in UPRAWY:
            sug = {"key": key, "nazwa": UPRAWY[key].nazwa, "roslina": c.get("roslina") or UPRAWY[key].nazwa,
                   "rok": D.year, "udzial": c.get("udzial", 0), "zrodlo": c.get("zrodlo", "")}
            break
    return {"ok": True, "dzialka": _dzialka_out(d) | {"pokrycie": pokrycie,
                                                       "kategoria": wi.dane["kategoria"] if wi.ok else None},
            "podpowiedz": None if kod else sug,
            "czesci": [] if kod else czesci_lista,
            "arimr_powod": None if sug else (cz.powod or "brak rozpoznanej uprawy na działce"),
            "zrodla": [w.opis(), wi.opis(), cz.opis()]}


async def _w_czasie(coro, zrodlo: str, s: float = C.BUDZET_KARTY_S):
    """Wynik źródła albo pusty Wynik, gdy nie zdąży w `s` sekund (karta działki ma się pokazać szybko)."""
    try:
        return await asyncio.wait_for(coro, s)
    except asyncio.TimeoutError:
        return Wynik(zrodlo, None, powod=f"nie odpowiedziało w {s:.0f} s")


def _dzialka_out(d: dict) -> dict:
    ring = max(d["rings"], key=len)
    return {k: d[k] for k in ("id", "teryt", "wojewodztwo", "powiat", "gmina", "obreb", "numer", "lon", "lat")} | {
        "pow_ha": round(d["pow_ha"], 2), "svg": svg_ksztalt(d["rings"]),
        "geometria": [[round(x, 6), round(y, 6)] for x, y in ring]}


def _clms_rok(cl, rok: int) -> dict | None:
    """Uprawa z mapy CLMS dla roku, jeśli pewna (≥ 50% pikseli działki); kod 0 na gruncie rolnym → użytek zielony."""
    if not cl or not cl.ok or rok not in cl.dane:
        return None
    c = dict(cl.dane[rok])
    if c["kod"] == 0:
        c["key"], c["nazwa"] = "laka", "użytek zielony / pastewne"
    return c if c["key"] and c["udzial"] >= 0.5 else None


def projekcja(rings, W=300, H=200, m=18):
    """Rzut lon/lat → układ mapy 300×200 (jak w makiecie). Zwraca funkcję tr(lon, lat) i skalę (jedn./stopień)."""
    lat0 = sum(p[1] for p in rings[0]) / len(rings[0])
    k = math.cos(math.radians(lat0))
    xs = [p[0] * k for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    s = min((W - 2 * m) / (max(xs) - min(xs) + 1e-12), (H - 2 * m) / (max(ys) - min(ys) + 1e-12))
    ox = (W - s * (max(xs) - min(xs))) / 2
    oy = (H - s * (max(ys) - min(ys))) / 2
    x0, y0 = min(xs), min(ys)
    return (lambda lon, lat: (ox + s * (lon * k - x0), H - (oy + s * (lat - y0)))), s, k


def pin_pct(tr, lon, lat, W=300, H=200) -> dict:
    a, b = tr(lon, lat)
    return {"x": round(min(97, max(3, a / W * 100)), 1), "y": round(min(95, max(5, b / H * 100)), 1)}


def svg_ksztalt(rings, W=300, H=200) -> dict:
    """Poligon działki w układzie mapy, punkty wewnątrz (piny) i podziałka."""
    tr, s, _ = projekcja(rings, W, H)
    polys = [" ".join(f"{a:.1f},{b:.1f}" for a, b in (tr(x, y) for x, y in r)) for r in rings]
    pins = [pin_pct(tr, x, y, W, H) for x, y in geo.grid_points(rings, 5)]
    return {"polys": polys, "pins": pins, "m_na_100px": round(111320 / s * 100, 0)}


def svg_teren(rings, ter: dict, hyd: dict | None) -> dict:
    """Warstwa „Teren i spływ” w układzie mapy: komórki DEM (klasy wysokości), zagłębienia, wody, punkt wypływu."""
    tr, s, k = projekcja(rings)
    sx, sy = ter["krok"][0] * k * s, ter["krok"][1] * s
    zin = [c[2] for c in ter["siatka"] if c[4]] or [c[2] for c in ter["siatka"]]
    q = np.percentile(zin, [20, 40, 60, 80])
    kol = ["#F3EBDD", "#E6D5B8", "#D6BE93", "#C2A36F", "#A8864F"]
    cells = []
    for lon, lat, z, dep, _ in ter["siatka"]:
        x, y = tr(lon, lat)
        if -sx < x < 300 + sx and -sy < y < 200 + sy:
            cells.append([round(x - sx / 2, 1), round(y - sy / 2, 1), kol[int(np.searchsorted(q, z))], 1 if dep > 0.1 else 0])
    linie = []
    for l in (hyd or {}).get("linie", []):
        pts = [tr(a, b) for a, b in l["c"]]
        linie.append({"typ": l["typ"], "d": " ".join(f"{a:.1f},{b:.1f}" for a, b in pts)})
    wyp = ter.get("wyplyw")
    return {"cells": cells, "w": round(sx + 0.6, 2), "h": round(sy + 0.6, 2), "linie": linie,
            "wyplyw": tr(wyp["lon"], wyp["lat"]) if wyp else None,
            "zakres": [round(min(zin), 1), round(max(zin), 1)], "zrodlo": ter.get("zrodlo", "")}


def svg_sucho(rings, sat: dict) -> dict:
    """Warstwa „Gdzie sucho”: piksele 20 m z z‑score NDMI (kolory jak w makiecie)."""
    tr, s, _ = projekcja(rings)
    pm = sat.get("piksel_m", 20)
    w, h = pm / 111320 * s, pm / 110574 * s
    col = lambda z: "#b8322f" if z <= -2 else "#d9625a" if z <= -1.25 else "#eea69b" if z <= -0.5 else "#f0efec" if z < 0.6 else "#9ec5f4"
    cells = []
    for lon, lat, z in sat["piksele"]:
        x, y = tr(lon, lat)
        cells.append([round(x - w / 2, 1), round(y - h / 2, 1), col(z)])
    return {"cells": cells, "w": round(w + 0.4, 2), "h": round(h + 0.4, 2), "data": sat["data"],
            "sucho_ha": sat["sucho_ha"], "z_med": sat["z_med"], "lata": sat["lata_ref"],
            "sensor": sat.get("sensor", "Sentinel‑2"), "piksel_m": pm}


# ---------------------------------------------------------------- analiza
def rok_sceny(u, D: date) -> int:
    """Rok, z którego pochodzi zdjęcie: w wegetacji – rok D; poza nią – sezon z ostatnim pełnym oknem wrażliwym uprawy."""
    _, faza_d = kc_dnia(u, D, C.KC_POZA)
    if faza_d != "poza wegetacją":
        return D.year
    return D.year if D > date(D.year, *u.okno[1]) else D.year - 1


async def _satelita(rings, D: date, u) -> tuple:
    """NDMI z satelity (P10) w budżecie czasu BUDZET_SATELITA_S: te usługi regularnie nie odpowiadają, a raport nie
    może na nie czekać. Po przekroczeniu raport idzie bez stanu roślin, z powodem w „czego nie sprawdziliśmy”."""
    try:
        return await asyncio.wait_for(_satelita_lancuch(rings, D, u), C.BUDZET_SATELITA_S)
    except asyncio.TimeoutError:
        w = Wynik("Sentinel‑2 / Landsat – zdjęcia satelitarne", None,
                  powod=f"usługi zdjęć satelitarnych nie odpowiedziały w {C.BUDZET_SATELITA_S:.0f} s",
                  czas_ms=int(C.BUDZET_SATELITA_S * 1000))
        return w, [w.opis()]


async def _satelita_lancuch(rings, D: date, u) -> tuple:
    """NDMI z satelity (P10): Sentinel Hub → Planetary Computer → Landsat. Okno sceny zależy od uprawy `u`, która rosła
    w roku sceny – w wegetacji ostatnie 25 dni, poza nią okno wrażliwe minionego sezonu. Zwraca (surowy wynik, opisy
    źródeł); anomalię liczy `satellite.anomalia`, gdy znana jest historia upraw (L1)."""
    z: list = []
    _, faza_d = kc_dnia(u, D, C.KC_POZA)
    if faza_d != "poza wegetacją":
        okno_sat = (D - timedelta(days=25), D)
    else:
        y_s = rok_sceny(u, D)
        okno_sat = (date(y_s, *u.okno[0]), date(y_s, *u.okno[1]))
    async with httpx.AsyncClient() as client:
        wsh = await cdse.ndmi_anomalia_sh(client, rings, D, okno_sat)
        wsat = wsh if wsh.ok else await satellite.ndmi_anomalia(client, rings, D, okno_sat)
        if not wsh.ok:
            z.append(wsh.opis())
            if not wsat.ok:
                wsat.powod = f"Sentinel Hub: {wsh.powod}; Planetary Computer: {wsat.powod}"
        if not wsat.ok:                     # zapas: Landsat (lata < 2016 albo za mało lat Sentinel‑2 do porównania)
            z.append(wsat.opis())
            wls = await satellite.ndmi_landsat(client, rings, D, okno_sat)
            if not wls.ok:
                wls.powod = f"Sentinel‑2: {wsat.powod}; Landsat: {wls.powod}"
            wsat = wls
    z.append(wsat.opis())
    return wsat, z


def lata_tej_samej_uprawy(lata: list[int], u_scena: Uprawa, dzien: date, uprawa_roku) -> set[int]:
    """Lata odniesienia dla NDMI (L1): ta sama grupa łanu co uprawa na zdjęciu i rośliny na polu w tym dniu roku
    (po zbiorze NDMI mierzy glebę i resztki, nie rośliny). Lata, w których nie wiemy, co rosło, odpadają."""
    g = grupa(u_scena)
    ok = set()
    for y in lata:
        uy = uprawa_roku(y)[0]
        if uy is None or g is None or grupa(uy) != g:
            continue
        if kc_dnia(uy, _shift(dzien, y - dzien.year), C.KC_POZA)[1] == "poza wegetacją":
            continue
        ok.add(y)
    return ok


def _satelita_wzgledem_uprawy(w: Wynik, u_scena: Uprawa, uprawa_roku, wcl: Wynik) -> tuple[Wynik, dict]:
    """Anomalia NDMI tylko względem lat z tą samą grupą łanu. Przy < 3 latach – brak oceny satelitarnej z podaniem przyczyny."""
    if not w.ok:
        return w, {}
    dzien = date.fromisoformat(w.dane["meta"]["data"])
    if grupa(u_scena) is None:
        return Wynik(w.zrodlo, None, powod=f"dla uprawy „{u_scena.nazwa.lower()}” nie porównujemy zdjęć z innymi latami "
                                           "(brak grupy upraw o podobnym łanie)", url=w.url, czas_ms=w.czas_ms), {}
    if kc_dnia(u_scena, dzien, C.KC_POZA)[1] == "poza wegetacją":
        return Wynik(w.zrodlo, None, powod=f"w dniu zdjęcia ({dzien:%d.%m.%Y}) pole jest bez roślin — satelita nie ocenia stanu roślin",
                     url=w.url, czas_ms=w.czas_ms), {}
    lata_ok = lata_tej_samej_uprawy([y for y, _ in w.dane["refs"]], u_scena, dzien, uprawa_roku)
    powod = None
    if len(lata_ok) < satellite.MIN_LAT_REF and not wcl.ok:
        powod = (f"mapa upraw Copernicus nie odpowiedziała ({wcl.powod}) — nie wiemy, co rosło w latach odniesienia, "
                 "więc nie porównujemy zdjęć satelitarnych")
    wynik = satellite.anomalia(w, lata_ok, powod)
    uprawy_ref = {y: uprawa_roku(y)[0].nazwa.lower() for y in sorted(lata_ok)}
    if wynik.ok:
        wynik.dane["uprawy_ref"] = uprawy_ref
        wynik.dane["grupa"] = grupa(u_scena)
    return wynik, uprawy_ref


async def analizuj(ident: str | None, lon: float | None, lat: float | None, D: date, uprawa: str | None) -> dict:
    t0 = time.perf_counter()
    dzis = date.today()
    async with httpx.AsyncClient() as client:
        wd = await sources.dzialka(client, ident, lon, lat)
        if not wd.ok:
            return {"ok": False, "powod": wd.powod, "zrodla": [wd.opis()]}
        d = wd.dane
        K = C.BUDZET_KONTEKST_S
        teraz_hydro = hydro.biezace(D, dzis)
        zad = {
            "m": sources.meteo_archiwum(client, d["lat"], d["lon"], D),
            "i": sources.iung_kategoria(client, d["rings"]),
            "a": sources.arimr_uprawa(client, d["rings"], D.year),
            # rok wcześniej: mapa upraw CLMS kończy się na 2024, więc bez tego sezon 2025 byłby „nieznany” (L1)
            "a1": _w_czasie(sources.arimr_uprawa(client, d["rings"], D.year - 1), f"ARiMR – deklaracje upraw {D.year - 1}", K),
            "dem": terrain.pobierz_dem(client, d["rings"]),
            "h": bdot.hydrografia(d["rings"], d.get("teryt") or d.get("id") or ""),
            "edo": _w_czasie(context.edo_cdi(client, d["lon"], d["lat"], D), "EDO – Combined Drought Indicator", K),
            "sg": _w_czasie(context.soilgrids(client, d["lon"], d["lat"]), "SoilGrids (ISRIC)", K),
            "cl": _w_czasie(cdse.uprawy_clms(client, d["rings"]), "CLMS Crop Types 2017–2024 (CDSE)", K),
            # MPHP odpowiada w 3–12 s; idzie równolegle z resztą, a zlewnia trafia do cache na stałe
            "zl": _w_czasie(hydro.zlewnia(client, d["lon"], d["lat"]), "MPHP10k – zlewnie (Wody Polskie)", C.BUDZET_MPHP_S),
        }
        if teraz_hydro:
            zad["ws"] = _w_czasie(hydro.wodowskazy(client, d["lon"], d["lat"]), "IMGW‑PIB – stany wód (bieżące)", K)
            zad["os"] = _w_czasie(hydro.ostrzezenia_susza(client, d.get("wojewodztwo") or ""), "IMGW‑PIB – ostrzeżenia hydrologiczne", K)
        if D >= dzis - timedelta(days=1):
            zad["p"] = _w_czasie(sources.meteo_prognoza(client, d["lat"], d["lon"]), "Open‑Meteo (prognoza 16 dni)", K)
        uprawa_0 = uprawa
        sat_task = asyncio.create_task(_satelita(d["rings"], D, UPRAWY[uprawa])) if uprawa in UPRAWY else None
        res = dict(zip(zad, await asyncio.gather(*zad.values())))
    wm, wi, wa, wa1, wdem, wh, wedo, wsg, wcl = (res[k] for k in ("m", "i", "a", "a1", "dem", "h", "edo", "sg", "cl"))
    wzl, wws, wos, wp = res["zl"], res.get("ws"), res.get("os"), res.get("p")
    zrodla = [wd.opis(), wm.opis(), wi.opis(), wa.opis(), wa1.opis(), wdem.opis(), wh.opis(), wedo.opis(), wsg.opis(), wcl.opis(),
              wzl.opis()] + [w.opis() for w in (wws, wos, wp) if w]
    edo = wedo.dane if wedo.ok else None
    sg = wsg.dane if wsg.ok else None
    braki: list[str] = []

    # --- F0 uprawa
    zrodlo_uprawy = "wybrane przez rolnika"
    if uprawa:
        # podpowiedź z karty działki wraca jako wybrana uprawa – nazwij źródło, jeśli to uprawa z deklaracji / mapy upraw
        zadekl = [wa.dane["roslina"], *wa.dane.get("inne", [])] if wa.ok else []
        r = next((x for x in zadekl if z_arimr(x) == uprawa), None)
        c = _clms_rok(wcl, D.year)
        if r:
            zrodlo_uprawy = f"deklaracja ARiMR {D.year}: {r}"
        elif c and c["key"] == uprawa:
            zrodlo_uprawy = f"mapa upraw Copernicus {D.year}: {c['nazwa']}"
    else:
        if wa.ok and wa.dane["udzial"] >= 0.3 and z_arimr(wa.dane["roslina"]):
            uprawa = z_arimr(wa.dane["roslina"])
            zrodlo_uprawy = f"deklaracja ARiMR {D.year}: {wa.dane['roslina']}"
        elif _clms_rok(wcl, D.year):
            c = _clms_rok(wcl, D.year)
            uprawa, zrodlo_uprawy = c["key"], f"mapa upraw Copernicus {D.year}: {c['nazwa']}"
        elif wi.ok and wi.dane["nierolnicza"] and not (wa.ok and wa.dane["udzial"] >= 0.1):
            uprawa, zrodlo_uprawy = "inna", "—"      # grunt nierolny: uprawa nie jest potrzebna, raport „poza zakresem”
        else:
            return {"ok": False, "potrzebna_uprawa": True, "powod": "Brak deklaracji ARiMR i mapy upraw Copernicus dla tej działki i roku — wybierz uprawę.",
                    "zrodla": zrodla}
    u = UPRAWY.get(uprawa) or UPRAWY["inna"]

    # --- uprawa w każdym roku (L1, L2): rok D – wybór rolnika; inne lata – deklaracja ARiMR, potem mapa upraw CLMS
    arimr_lat = {D.year: wa, D.year - 1: wa1}

    def uprawa_roku(y: int) -> tuple[Uprawa | None, str]:
        if y == D.year:
            return u, zrodlo_uprawy
        wy = arimr_lat.get(y)
        if wy is not None and wy.ok and wy.dane["udzial"] >= 0.3 and z_arimr(wy.dane["roslina"]):
            return UPRAWY[z_arimr(wy.dane["roslina"])], f"ARiMR: {wy.dane['roslina']}"
        c = _clms_rok(wcl, y)
        if c:
            return UPRAWY[c["key"]], f"Copernicus: {c['nazwa']}"
        return None, "przyjęto bieżącą uprawę"

    # --- satelita (P10): gdy uprawa była znana od początku, zdjęcie pobierało się równolegle z resztą źródeł
    y_s = rok_sceny(u, D)
    u_s = uprawa_roku(y_s)[0]
    if u_s is not None and u_s.key != u.key and y_s != D.year:
        # poza sezonem zdjęcie jest z minionego sezonu – okno wrażliwe tej uprawy, która wtedy rosła
        wsat, z_sat = await _satelita(d["rings"], D, u_s)
        if sat_task:
            sat_task.cancel()
    else:
        wsat, z_sat = await (sat_task if sat_task and uprawa == uprawa_0 else _satelita(d["rings"], D, u))
        if u_s is None and y_s != D.year:
            braki.append(f"nie wiemy, co rosło w {y_s} — dla zdjęcia z tamtego sezonu przyjęto okno bieżącej uprawy")
    zrodla += z_sat
    wsat, uprawy_ref = _satelita_wzgledem_uprawy(wsat, u_s or u, uprawa_roku, wcl)

    out: dict = {"ok": True, "data": D.isoformat(), "dzialka": _dzialka_out(d),
                 "uprawa": {"key": u.key, "nazwa": u.nazwa, "zrodlo": zrodlo_uprawy, "okno": u.okno_opis}}

    # --- gleba (F6)
    if wi.ok and wi.dane["nierolnicza"] and not (wa.ok and wa.dane["udzial"] >= 0.1):
        out.update(poza_zakresem(NIEROLNE.get(wi.dane["nierolnicza_kod"], "teren nierolniczy")))
        out["zrodla"] = zrodla
        out["surowe"] = {"rings": d["rings"], "pokrycie_kod": wi.dane["nierolnicza_kod"], "pow_ha": d["pow_ha"]}
        return out
    if wi.ok and wi.dane["kategoria"]:
        kat = wi.dane["kategoria"]
    else:
        kat = 2
        braki.append("kategoria gleby IUNG niedostępna — przyjęto kat. II (średnia dla Polski)")
    if not wm.ok:
        out.update({"ok": False, "powod": f"Brak danych pogodowych ({wm.powod}) — bez nich nie oceniamy sytuacji wodnej.",
                    "zrodla": zrodla})
        return out

    m = Meteo.z_json(wm.dane["daily"])
    Dm = min(D, m.dni[-1])
    if Dm < D:
        braki.append(f"dane pogodowe kończą się {Dm:%d.%m.%Y} (opóźnienie archiwum)")
    TAW = C.WOD_MM[kat] * min(u.zr, 1.0)
    CN = C.CN_02[kat]

    # --- bilans ciągły od początku archiwum do D (F4) – w każdym roku z uprawą, która wtedy rosła (L2);
    #     drugi przebieg z bieżącą uprawą odpowiada na pytanie „ile wody potrzebowałaby ta uprawa w tamtych latach” (R8)
    iD = m.idx[Dm]
    u_hist = lambda y: uprawa_roku(y)[0] or u
    ciag = bilans(m.P[: iD + 1], m.ET0[: iD + 1], m.dni[: iD + 1], u, TAW, CN, u_roku=u_hist)
    ciag_u = bilans(m.P[: iD + 1], m.ET0[: iD + 1], m.dni[: iD + 1], u, TAW, CN)
    Dr = float(ciag["Dr"][-1])
    F4 = 1 - Dr / TAW
    F4p = 1 - u.p
    kc, faza = kc_dnia(u, Dm, C.KC_POZA)
    w_sez = date(D.year, 3, 21) <= D <= date(D.year, 9, 30)
    okno_teraz = w_oknie(u, Dm) and faza != "poza wegetacją"

    # --- KBW teraz (F1–F3) i historia (F5)
    kbw = ocena_kbw_teraz(m, u, kat, Dm) if w_sez else {"dostepny": False, "powod": "poza sezonem progów IUNG (21.III–30.IX)"}
    ost = D.year if D > date(D.year, 9, 30) else D.year - 1
    lata = list(range(ost - 9, ost + 1))
    hist = []
    for y in lata:
        uy, zr_y = uprawa_roku(y)
        uy = uy or u
        h = sezon_kbw(m, uy, kat, y)
        h["uprawa"], h["uprawa_zr"] = uy.nazwa.lower(), zr_y
        hist.append(h)
    n_upr_znane = sum(1 for h in hist if h["uprawa_zr"] != "przyjęto bieżącą uprawę")
    # dni stresu i niedobór w oknie wrażliwym w każdym sezonie – ta sama uprawa co KBW w kafelku (L2)
    dni_D = m.dni[: iD + 1]
    lata_d = np.array([dd.year for dd in dni_D])
    okno_mask = np.array([w_oknie(u_hist(dd.year), dd) for dd in dni_D])
    okno_mask_u = np.array([w_oknie(u, dd) for dd in dni_D])
    for h in hist:
        sel = lata_d == h["rok"]
        h["dni_stresu"] = int(ciag["stres"][sel].sum())
        h["brak_okno"] = float(ciag["brak"][sel & okno_mask].sum())
        h["brak_okno_u"] = float(ciag_u["brak"][sel & okno_mask_u].sum())   # gdyby rosła bieżąca uprawa (R8)
        if not h.get("dostepny"):          # uprawa bez progu IUNG (łąka, burak kat. I) – stopień z dni stresu w bilansie FAO‑56
            ds = h["dni_stresu"]
            h.update(dostepny=True, bilans=True, kbw=None, prog=None, okres="",
                     stopien=None,
                     miesiace=sorted({dd.month for dd, st in zip(m.dni[: iD + 1], ciag["stres"]) if st and dd.year == h["rok"]}))
    bil = [h for h in hist if h.get("bilans")]
    if bil:                                 # ocena względna: dni stresu ponad medianę z okna (susza = rok wyraźnie gorszy niż zwykle)
        med_ds = float(np.median([h["dni_stresu"] for h in bil]))
        for h in bil:
            dlt = h["dni_stresu"] - med_ds
            h["stopien"] = "silna" if dlt >= 25 else "umiark." if dlt >= 12 else "lekka" if dlt >= 5 else "brak"
    F5 = sum(1 for h in hist if h.get("dostepny") and h["stopien"] != "brak")
    hist_ok = [h for h in hist if h.get("dostepny")]
    mies = Counter(mm for h in hist_ok for mm in h["miesiace"])
    if not u.wiersz_iung:
        braki.append(f"brak urzędowego progu suszy IUNG dla uprawy „{u.nazwa}” — oceniamy z bilansu wody w glebie")

    # --- F14/F15 opad i upał
    if w_sez:
        a60, b60 = Dm - timedelta(days=59), Dm
    else:
        a60, b60 = date(ost, 5, 1), date(ost, 7, 31)
    P60 = m.suma(m.P, a60, b60) or 0.0
    E60 = m.suma(m.ET0, a60, b60) or 0.0
    normP, normE = [], []
    for k in range(1, C.LATA_NORMY + 1):
        pa, pb = _shift(a60, -k), _shift(b60, -k)
        if pa in m.idx and pb in m.idx:
            normP.append(m.suma(m.P, pa, pb))
            normE.append(m.suma(m.ET0, pa, pb))
    nP = float(np.mean(normP)) if normP else None
    nE = float(np.mean(normE)) if normE else None
    if w_sez:
        i30 = m.idx[Dm - timedelta(days=29)]
        upal = int((m.TMAX[i30: iD + 1] > 30).sum())
    else:
        i0, i1 = m.idx[date(ost, 6, 1)], m.idx[date(ost, 8, 31)]
        upal = int((m.TMAX[i0: i1 + 1] > 30).sum())

    # --- F11 prognoza 7 dni (albo klimatologia)
    prog = None
    if wp and wp.ok:
        dd = wp.dane["daily"]
        prog = {t: (p or 0.0, e or 0.0) for t, p, e in zip(dd["time"], dd["precipitation_sum"], dd["et0_fao_evapotranspiration"]) if t > Dm.isoformat()}
        F11 = sum(v[0] for k, v in sorted(prog.items())[:7])
        F11_src = "prognoza Open‑Meteo"
    else:
        vals = []
        for k in range(1, 11):
            a, b = _shift(Dm + timedelta(days=1), -k), _shift(Dm + timedelta(days=7), -k)
            if a in m.idx and b in m.idx:
                vals.append(m.suma(m.P, a, b))
        F11 = float(np.mean(vals)) if vals else 0.0
        F11_src = "średnia z 10 lat (dla dat archiwalnych nie ma prognozy wydanej tego dnia)"
        if D < dzis - timedelta(days=1):
            braki.append("data archiwalna — zamiast prognozy pogody używamy średnich z 10 poprzednich lat")

    # --- scenariusze bazowe (F17–F19)
    N = C.N_SCEN
    base = scenariusze(m, u, TAW, CN, Dm, Dr, None, N, prog)

    # --- teren (F7, F7b, F8) i woda (F9): NMT 1 m z cache (pobierany w tle), inaczej Copernicus DEM 30 m
    nmt = False
    nmt_w_tle = False
    if terrain.nmt_gotowy(d["rings"]):
        try:
            wn = terrain.wczytaj_nmt(d["rings"])
            if wn.ok and np.isfinite(wn.dane["z"]).mean() > 0.8:
                wdem, nmt = wn, True
                zrodla.append(wn.opis())
        except Exception:  # noqa: BLE001
            pass
    else:
        asyncio.get_running_loop().run_in_executor(None, terrain.pobierz_nmt, d["rings"])
        nmt_w_tle = True
    ter = terrain.analiza_terenu(wdem.dane, d["rings"]) if wdem.ok else {"dostepny": False}
    if ter.get("dostepny"):
        ter["zrodlo"] = "NMT 1 m GUGiK (uśredniony do 5 m)" if nmt else "Copernicus DEM 30 m (model powierzchni)"
        if nmt_w_tle and not nmt:
            braki.append("dokładny model terenu NMT 1 m (GUGiK) pobiera się w tle (1–3 min) — teraz teren z Copernicus DEM 30 m; "
                         "odśwież raport później, by przeliczyć spadki i zagłębienia na NMT")
    else:
        powod_ter = powod_czytelny(wdem.powod if not wdem.ok else None)
        braki.append(f"model terenu niedostępny ({powod_ter}) — nie oceniliśmy spadków, spływu i zagłębień")
    hyd = wh.dane if wh.ok else None
    if not hyd:
        braki.append("brak danych o rowach i ciekach (BDOT10k) — nie oceniliśmy możliwości piętrzenia")
    i10 = m.idx.get(date(lata[0], 1, 1), 0)
    P10 = m.P[i10: iD + 1]
    S_cn = s_cn(CN)
    ulewy = P10[P10 > 10]
    F7b = float(sum(odplyw(float(x), S_cn) for x in ulewy) / ulewy.sum()) if len(ulewy) else 0.0
    # tylko zagłębienia leżące w ≥ 30% na działce – na cudzym gruncie rolnik oczka nie zrobi
    zagl = [z for z in ter.get("zaglebienia", []) if z.get("udzial_w", 1.0 if z["w_dzialce"] else 0.0) >= 0.3]
    F8 = max(zagl, key=lambda z: z["objetosc_m3"]) if zagl else None
    najbl = (hyd or {}).get("najblizsze", {})
    rowy = [x for x in (najbl.get("SWRM_L"), najbl.get("SWKN_L")) if x]
    F9 = min(rowy, key=lambda x: x["dist_m"]) if rowy else None
    # --- hydrologia (L3): zlewnia MPHP, wodowskaz i ostrzeżenia IMGW (tylko dla analizy na dziś)
    zl = wzl.dane if wzl.ok else None
    if not zl:
        braki.append(f"zlewnia z MPHP (Wody Polskie) niedostępna: {wzl.powod} — nie oceniamy, skąd spływa woda do rowu")
    rzeka_bdot = (najbl.get("SWRS_L") or {}).get("nazwa") or None
    stacja = hydro.wybierz_stacje(wws.dane, rzeka_bdot) if wws is not None and wws.ok else None
    ostrz = (wos.dane or []) if wos is not None and wos.ok else []
    if not teraz_hydro:
        braki.append("stany rzek i ostrzeżenia hydrologiczne IMGW są tylko bieżące — dla daty archiwalnej ich nie oceniamy")
    else:
        if wws is not None and not wws.ok:
            braki.append(f"stan rzek IMGW niedostępny: {wws.powod}")
        if wos is not None and not wos.ok:
            braki.append(f"ostrzeżenia hydrologiczne IMGW niedostępne: {wos.powod}")
    ostrz_txt = ("Ostrzeżenie IMGW dla regionu: " + ostrz[0]["opis"] + (f" — {ostrz[0]['przebieg']}" if ostrz[0]["przebieg"] else "")
                 + f" (od {ostrz[0]['od']}; dotyczy zlewni w województwie, niekoniecznie cieku przy działce)") if ostrz else ""
    organiczna = bool(wi.ok and wi.dane["udzial_organiczne"] >= 0.3)
    wyp = ter.get("wyplyw")
    sat = wsat.dane if wsat.ok else None
    if not sat:
        braki.append(f"stan roślin z satelity niedostępny: {powod_czytelny(wsat.powod)}")
    strefa = sat and sat["sucho_ha"] >= 0.2 and sat["sucho_srodek"]
    gdzie_woda = (f"najsuchsza część działki, ok. {fmt(sat['sucho_ha'], 1)} ha (satelita {sat['data'][8:10]}.{sat['data'][5:7]})"
                  if strefa else "cała działka")
    pow_woda = sat["sucho_ha"] if strefa else d["pow_ha"]

    # ---------------------------------------------------------------- przyczyny (C1–C6)
    przyczyny = []
    if nP:
        r = P60 / nP
        sc = next((s for lim, s in C.C1_PROGI if r < lim), 0)
        okr = "w ostatnich 60 dniach" if w_sez else f"w maju–lipcu {ost}"
        przyczyny.append(dict(id="C1", name="Mało deszczu", score=sc, icon="rain", color="#2a78d6", fg="#FFFFFF",
                              ev=f"{okr} {fmt(P60)} mm zamiast ok. {fmt(nP)} mm normy ({fmt(100 * r)}%)", map=None))
    sc2 = next((s for lim, s in C.C2_DNI if upal >= (lim if w_sez else lim * 2)), 0)
    if nE and E60 / nE > C.C2_ET0:
        sc2 = max(sc2, 1)
    przyczyny.append(dict(id="C2", name="Upał / duże parowanie", score=sc2, icon="sun", color="#d65f2b", fg="#FFFFFF",
                          ev=(f"{dni(upal)} ponad 30°C w ostatnich 30 dniach" if w_sez else f"{dni(upal)} ponad 30°C latem {ost}")
                          + (f" · parowanie {fmt(100 * E60 / nE)}% normy" if nE else ""), map=None))
    sc3 = 3 if kat == 1 else 2 if kat == 2 else 0
    if TAW < C.C3_TAW:
        sc3 = max(sc3, 2)
    przyczyny.append(dict(id="C3", name="Lekka gleba — mały „zbiornik” na wodę", score=sc3, icon="sand", color="#C9A46B",
                          fg="#1A1C19", ev=f"kategoria IUNG {KAT_OPIS[kat]} · woda dostępna w strefie korzeni ok. {fmt(TAW)} mm"
                             + (f" · {fmt(sg['piasek'])}% piasku, {fmt(sg['soc'], 1)}% węgla (SoilGrids)" if sg else ""),
                          map="gleba"))
    if w_sez and okno_teraz and F4 < F4p:
        przyczyny.append(dict(id="C6", name="Niedobór w krytycznej fazie", score=2, icon="sun", color="#a8401a",
                              fg="#FFFFFF", ev=f"{u.nazwa.lower()}: {u.faza_krytyczna} ({u.okno_opis})", map=None))
    sc4 = 0
    if ter.get("dostepny"):
        sr = ter["spadek_sr"]
        sc4 = 3 if sr > 8 else 2 if sr > 5 else 1 if sr > 3 else 0
        if F7b > 0.10:
            sc4 = max(sc4, 1)
        przyczyny.append(dict(id="C4", name="Woda spływa z pola", score=sc4, icon="slope", color="#5F625B", fg="#FFFFFF",
                              ev=f"średni spadek {fmt(sr)}%, na {fmt(100 * ter['udzial_pow_3'])}% działki ponad 3% · przy ulewach "
                                 f"(> 10 mm) ok. {fmt(100 * F7b)}% deszczu spływa (SCS‑CN)"
                                 + (f" · {fmt(100 * wyp['udzial'])}% działki odpływa jednym miejscem" if wyp else ""), map="teren"))
    if F9 and F9["dist_m"] <= 100:
        sc5 = 2 if F9["dist_m"] <= 30 else 1
        if organiczna:
            sc5 = 3
        przyczyny.append(dict(id="C5", name="Rów odprowadza wodę", score=sc5, icon="ditch", color="#1f6fc9", fg="#FFFFFF",
                              ev=f"{F9['typ']} {fmt(F9['dist_m'])} m od granicy działki (BDOT10k)"
                                 + (" · gleba organiczna" if organiczna else ""), map="teren"))
    przyczyny = [p for p in przyczyny if p["score"] > 0]
    top = max((p["score"] for p in przyczyny if not p.get("mock")), default=0)
    for p in przyczyny:
        p["lvl"] = "główna" if p["score"] == top and not p.get("mock") else "duża" if p["score"] >= 2 else "mała"
        p["ctl"] = "pogoda" if p["id"] in ("C1", "C2") else "da się zmienić" if p["id"] != "C6" else "termin"
    przyczyny.sort(key=lambda p: (p.get("mock", False), -p["score"]))

    # ---------------------------------------------------------------- reguły (R1–R9)
    akcje: list[dict] = []
    ryz_max = base["f18_max"] if base.get("dostepny") else 0.0
    po_zbiorze = Dm > koniec_wegetacji(u, Dm.year) or not w_sez
    plan_all = Plan(max_dawka=C.MAX_DAWKA[kat])

    def zysk(plan: Plan) -> dict:
        s = scenariusze(m, u, TAW, CN, Dm, Dr, plan, N, prog)
        return s

    potrzeba = bool(kbw.get("susza")) or F5 >= 3 or ryz_max >= C.PROG_ZAGROZENIE
    teraz_ret = "teraz, przed zimą (do połowy grudnia)" if not w_sez else "jesienią, po zbiorze"
    # R1 – zastawka / piętrzenie na rowie (F9 ≤ 100 m)
    if F9 and F9["dist_m"] <= 100 and potrzeba:
        nazwa = (" „" + F9["nazwa"] + "”") if F9["nazwa"] else ""
        duza = bool(zl and zl["pow_km2"] and zl["pow_km2"] > C.ZLEWNIA_DUZA_KM2)
        zl_txt = (f"rów leży w zlewni „{zl['nazwa']}”, ok. {fmt(zl['pow_km2'], 1)} km² (MPHP10k – przybliżenie zlewni rowu)"
                  if zl and zl["pow_km2"] else "zlewni rowu nie znamy (MPHP niedostępne)")
        akcje.append(dict(id="R1", cat="ret", layer="teren", title="Zastawka / piętrzenie na rowie",
                          where=f"{F9['typ']}{nazwa}, {fmt(F9['dist_m'])} m od granicy (punkt na mapie)",
                          when=teraz_ret, cause="rowem odpływa woda z okolicy działki",
                          gain=f"woda z roztopów zostaje w rowie i w glebie obok; {zl_txt}",
                          why=f"Według BDOT10k {F9['typ']} biegnie {fmt(F9['dist_m'])} m od działki. Spowolnienie odpływu (zastawka, "
                              "sterowany odpływ) zatrzymuje wodę zimową na wiosnę. Wymaga zgody zarządcy rowu (spółka wodna / Wody Polskie)."
                              + (f" Zlewnia jest duża (ponad {fmt(C.ZLEWNIA_DUZA_KM2)} km²) — piętrzenie wpływa na sąsiadów; zgłoś propozycję "
                                 "zarządcy cieku (Wody Polskie) zamiast budować samodzielnie." if duza else "")
                              + (f" {ostrz_txt}. Przy suszy hydrologicznej woda zatrzymana zimą jest szczególnie cenna." if ostrz else ""),
                          chips=["spowolnienie odpływu (NWRM)", "zgłoszenie wodnoprawne"] + (["zlewnia MPHP"] if zl else [])
                                + (["zgłoś zarządcy"] if duza else []), lonlat=(F9["lon"], F9["lat"]),
                          steps=["Ustal zarządcę rowu (spółka wodna lub Wody Polskie) i uzgodnij z nim piętrzenie.",
                                 "Złóż zgłoszenie wodnoprawne, zanim zaczniesz budowę.",
                                 "Postaw zastawkę lub próg w miejscu z mapy i zamknij ją na zimę, żeby zatrzymać roztopy.",
                                 "Wiosną otwieraj ją stopniowo, tak aby pole dało się uprawiać."]))
    # R2 – zagłębienie / oczko (F8)
    if F8 and (F8["objetosc_m3"] >= 100 or F8["pow_ha"] >= 0.05) and potrzeba:
        v = F8["objetosc_m3"]
        akcje.append(dict(id="R2", cat="ret", layer="teren", title="Zatrzymaj wodę w zagłębieniu",
                          where=f"zagłębienie ok. {fmt(F8['pow_ha'], 2)} ha na działce (punkt na mapie)",
                          when=("teraz lub wczesną wiosną" if not w_sez else "po zbiorze, poza wegetacją"),
                          cause="tu zbiera się deszcz — zagłębienie bez odpływu",
                          gain=(f"ok. {fmt(round(v, -1))} m³ wody — ok. {fmt(v / (200 * d['pow_ha']), 1)} dawki 20 mm dla całej działki" if v >= 200 * d["pow_ha"] else f"ok. {fmt(round(v, -1))} m³ wody — dawka 20 mm dla ok. {fmt(v / 200, 1)} ha"),
                          why=f"Model terenu ({ter['zrodlo']}) pokazuje zagłębienie bez odpływu o objętości ok. {fmt(v)} m³. "
                              "Oczko lub niecka zatrzyma tu wodę z ulew i roztopów." + ("" if nmt else " Rozdzielczość 30 m jest zgrubna — sprawdź miejsce w terenie."),
                          chips=[f"ok. {fmt(v)} m³", "NWRM N01", "sprawdź w terenie"], lonlat=(F8["lon"], F8["lat"]),
                          steps=["Po deszczu lub roztopach obejrzyj miejsce z mapy — czy woda faktycznie tam stoi.",
                                 "Nie zasypuj zagłębienia i nie odprowadzaj z niego wody drenem ani rowem.",
                                 "Pogłęb je lub lekko obwałuj, żeby powstało oczko albo niecka trzymająca wodę.",
                                 "Obsiej brzegi trawą, żeby niecka nie zamulała się ziemią z pola.",
                                 "Przed pracami ziemnymi zapytaj w gminie, czy potrzebne jest zgłoszenie."]))
    # R3 – pas buforowy przy punkcie wypływu (C4 ≥ 1)
    if sc4 >= 1 and wyp:
        s3 = zysk(Plan(cn_minus=5))
        dd3 = base["dni_stresu_sr"] - s3["dni_stresu_sr"] if s3.get("dostepny") else 0
        plan_all.cn_minus = 5
        akcje.append(dict(id="R3", cat="ret", layer="teren", title="Pas trawy lub drzew przy wypływie",
                          where="granica działki w miejscu wypływu wody, pas 6–10 m (punkt na mapie)",
                          when=("sadzenie: listopad lub marzec" if not w_sez else "od jesieni"),
                          cause=f"przy ulewach ok. {fmt(100 * F7b)}% deszczu spływa",
                          gain=(f"mniej wody ucieka z ulew; średnio {fmt(dd3, 1)} dnia stresu mniej (scenariusze)" if dd3 >= 0.05
                                else "o ok. 30–50% mniej wody ucieka z ulew w tym miejscu (NWRM)"),
                          why=f"Według modelu terenu {fmt(100 * wyp['udzial'])}% powierzchni działki odpływa jednym miejscem na granicy. "
                              f"Średni spadek {fmt(ter['spadek_sr'])}%. Pas trawy lub zadrzewienie spowolni spływ i zatrzyma glebę.",
                          chips=["pas 6–10 m", "NWRM A02", "ekoschematy"], lonlat=(wyp["lon"], wyp["lat"]),
                          steps=["Wyznacz pas szerokości 6–10 m wzdłuż granicy w miejscu wypływu (punkt na mapie).",
                                 "Obsiej go trawą albo posadź krzewy lub drzewa i wyłącz z orki.",
                                 "Koś pas raz lub dwa razy w roku i nie przejeżdżaj po nim ciężkim sprzętem.",
                                 "Sprawdź, czy pas możesz zgłosić do ekoschematów."]))
    # R4 – gleba organiczna: nie odwadniać
    if organiczna:
        akcje.append(dict(id="R4", cat="ret", layer="gleba", title="Nie odwadniaj — chroń glebę organiczną",
                          where="część działki z glebą organiczną", when="stale",
                          cause="gleba organiczna (IUNG) — obniżenie wody ją niszczy",
                          gain="woda i węgiel zostają w glebie", why="Według mapy IUNG‑PIB część działki to gleby organiczne.",
                          chips=["NWRM N02"],
                          steps=["Nie pogłębiaj rowów ani drenów na tej części działki.",
                                 "Jeśli są zastawki, trzymaj je zamknięte, żeby woda stała wysoko.",
                                 "Prowadź tu raczej łąkę lub pastwisko niż orkę."]))
    # R6 – uprawa w poprzek stoku (C4 ≥ 2)
    if sc4 >= 2:
        akcje.append(dict(id="R6", cat="agro", layer="teren", title="Uprawa w poprzek stoku",
                          where="strefy o spadku ponad 3%", when="przy najbliższej uprawie",
                          cause=f"średni spadek {fmt(ter['spadek_sr'])}% — uprawa wzdłuż stoku przyspiesza spływ",
                          gain="mniej wody i gleby ucieka z ulew",
                          why="Uprawa i siew w poprzek stoku zatrzymują wodę w bruzdach (NWRM A04).",
                          chips=["NWRM A04 / A07"],
                          steps=["Orz, bronuj i siej w poprzek spadku, wzdłuż poziomic.",
                                 "Na najbardziej stromych fragmentach zostaw w poprzek stoku pasy trawy."]))

    # R5 – międzyplon / resztki
    sc3v = next((p["score"] for p in przyczyny if p["id"] == "C3"), 0)
    F6c = sg["soc"] if sg else None
    if sc3v >= 2 or ryz_max >= C.PROG_ZAGROZENIE or (F6c is not None and F6c < 1.5):
        s5 = zysk(Plan(mulcz=True))
        dd = base["dni_stresu_sr"] - s5["dni_stresu_sr"] if s5.get("dostepny") else 0
        plan_all.mulcz = True
        if po_zbiorze:
            tytul, kiedy = "Zostaw resztki, nie orz na zimę", ("teraz — pole po zbiorze" if not w_sez else "zaraz po zbiorze")
            kroki5 = ["Rozdrobnij słomę i resztki i zostaw je na powierzchni pola.",
                      "Nie orz na zimę; jeśli musisz, zrób tylko płytką uprawę.",
                      "Wiosną siej w mulcz albo uprawiaj płytko, żeby nie przesuszyć gleby."]
        else:
            tytul, kiedy = "Międzyplon i resztki po zbiorze", f"po zbiorze ({koniec_wegetacji(u, Dm.year):%d.%m} wg kalendarza)"
            kroki5 = ["Zaraz po zbiorze wysiej międzyplon.",
                      "Resztki pożniwne zostaw na polu zamiast je usuwać."]
            if kat <= 2:
                kroki5.append("Zniszcz międzyplon wcześnie wiosną — sam też zużywa wodę.")
        chips = ["cała działka", "NWRM A08 / A13"] + (["zniszcz międzyplon wcześnie wiosną"] if kat <= 2 else [])
        akcje.append(dict(id="R5", cat="agro", layer="gleba", title=tytul, where="cała działka", when=kiedy,
                          cause="lekka gleba" if sc3v >= 2 else "ryzyko suszy w kolejnym sezonie",
                          gain=(f"średnio {fmt(dd, 1)} dnia stresu mniej w horyzoncie prognozy (scenariusze)" if dd >= 0.05
                                else "mniej parowania wiosną; efekt w tym horyzoncie niewielki"),
                          why=f"Gleba kat. {KAT_OPIS[kat]} (IUNG)" + (f", ok. {fmt(F6c, 1)}% węgla organicznego (SoilGrids)" if F6c is not None else "") + ". Resztki i okrywa ograniczają parowanie z gleby "
                              f"(ok. −25% przy 50% okrycia, FAO‑56) i poprawiają wsiąkanie."
                              + (" Na lekkiej glebie międzyplon zniszcz wcześnie wiosną — sam też zużywa wodę." if kat <= 2 else ""),
                          chips=chips, steps=kroki5))

    # R7 / R7- / R8 – nawadnianie
    RAW = u.p * TAW
    f18d = base.get("f18d")
    if w_sez:
        brak_mm = Dr - F11
        if (F4 < F4p or (f18d is not None and f18d <= 7)) and brak_mm > C.R7_MIN_BRAK and okno_teraz:
            dawka = min(brak_mm, C.MAX_DAWKA[kat])
            s7 = zysk(Plan(dawka_teraz=dawka))
            plan_all.dawka_teraz = dawka
            a14 = round(base["f18_14"] * base["N"]); b14 = round(s7["f18_14"] * s7["N"]) if s7.get("dostepny") else a14
            akcje.append(dict(id="R7", cat="irr", layer="sucho", title=f"Podlej {fmt(_r5(dawka) or dawka)} mm",
                              where=gdzie_woda, when="w ciągu 3 dni, rano lub wieczorem",
                              cause=f"zapas {fmt(100 * F4)}% przy progu {fmt(100 * F4p)}%, {u.nazwa.lower()} w fazie {faza}",
                              gain=f"stres w najbliższych 2 tygodniach: {a14}/{base['N']} → {b14}/{base['N']} scenariuszy",
                              why=f"Zapas wody w glebie ({fmt(100 * F4)}%) jest poniżej progu stresu, a {F11_src} daje "
                                  f"{fmt(F11)} mm deszczu w 7 dni. W oknie wrażliwym ({u.okno_opis}) brak wody najbardziej obniża plon.",
                              chips=[f"{fmt(dawka)} mm netto", f"ok. {fmt(dawka * pow_woda * 10)} m³", "bilans FAO‑56 + prognoza"],
                              lonlat=tuple(sat["sucho_srodek"]) if strefa else None,
                              steps=[f"Podaj ok. {fmt(dawka)} mm wody (ok. {fmt(dawka * pow_woda * 10)} m³) na części działki z mapy.",
                                     "Podlewaj rano lub wieczorem, kiedy mniej wody paruje.",
                                     "Jeśli przed podlaniem spadnie obfity deszcz, sprawdź raport ponownie."]))
        elif F4 >= F4p or F11 >= Dr - RAW:
            akcje.append(dict(id="R7-", cat="irr", layer="plan", title="Nie podlewaj teraz", where="cała działka",
                              when="sprawdź ponownie za tydzień",
                              cause=(f"zapas {fmt(100 * F4)}% — powyżej progu stresu" if F4 >= F4p else f"w 7 dni spadnie ok. {fmt(F11)} mm"),
                              gain="oszczędzasz wodę i koszty", why=f"Zapas wody {fmt(100 * F4)}%, próg stresu {fmt(100 * F4p)}%; {F11_src}: {fmt(F11)} mm w 7 dni.",
                              chips=["bilans FAO‑56"],
                              steps=["Nie włączaj nawadniania — " + ("gleba ma jeszcze zapas wody." if F4 >= F4p else "zapowiadany deszcz uzupełni wodę."),
                                     "Sprawdź raport ponownie za tydzień albo po kilku dniach upału."]))
    if not any(a["id"] == "R7" for a in akcje) and ryz_max >= C.PROG_ZAGROZENIE:
        s8 = zysk(Plan(nawadniaj=True, max_dawka=C.MAX_DAWKA[kat]))
        plan_all.nawadniaj = True
        if w_sez:
            braki_hist = [h["brak_okno_u"] for h in hist_ok]   # potrzeby bieżącej uprawy w pogodzie tamtych lat
            med, p80 = float(np.median(braki_hist)), float(np.percentile(braki_hist, 80))
        else:
            med, p80 = base["brak_med"], base["brak_p80"]
        imax = int(np.argmax(base["ryzyko"]))
        bmax = s8["ryzyko"][imax] if s8.get("dostepny") else base["ryzyko"][imax]
        akcje.append(dict(id="R8", cat="irr", layer="sucho", title=f"Przygotuj nawadnianie ({u.okno_opis})",
                          where=gdzie_woda, lonlat=tuple(sat["sucho_srodek"]) if strefa else None, when=("plan teraz, podlewanie " + u.okno_opis),
                          cause=f"w {base['ryzyko'][imax]} z {base['N']} scenariuszy stres {mies_w(base['kolumny'][imax])}",
                          gain=f"ryzyko {mies_w(base['kolumny'][imax])}: {base['ryzyko'][imax]}/{base['N']} → {bmax}/{base['N']}",
                          why=f"W typowym sezonie {u.nazwa.lower()} potrzebuje ok. {_r5(med)} mm dodatkowej wody w oknie "
                              f"wrażliwym, w suchym ok. {_r5(p80)} mm (bilans FAO‑56, {len(hist_ok) if w_sez else base['N']} sezonów). "
                              "Najpierw zatrzymaj wodę (działania 1–3), potem nawadniaj.",
                          chips=[f"{_r5(med)}–{_r5(p80)} mm / sezon", f"ok. {fmt(med * pow_woda * 10)}–{fmt(p80 * pow_woda * 10)} m³",
                                 "sprawdź źródło wody i pozwolenie"],
                          steps=["Sprawdź źródło wody (studnia, ciek, zbiornik) i czy potrzebujesz pozwolenia wodnoprawnego.",
                                 f"Przygotuj sprzęt na ok. {_r5(med)}–{_r5(p80)} mm w sezonie (ok. {fmt(med * pow_woda * 10)}–{fmt(p80 * pow_woda * 10)} m³).",
                                 "Najpierw zrób działania zatrzymujące wodę z tej listy — zmniejszą potrzebę podlewania.",
                                 f"Podlewaj w oknie wrażliwym ({u.okno_opis}), gdy raport pokaże zapas poniżej progu stresu."]))

    # R9 – inna uprawa
    if F5 >= 6 and u.wiersz_iung:
        alt = []
        for k2, u2 in UPRAWY.items():
            if k2 == u.key or not u2.wiersz_iung:
                continue
            n2 = sum(1 for y in lata if (s := sezon_kbw(m, u2, kat, y)).get("dostepny") and s["stopien"] != "brak")
            alt.append((n2, u2.nazwa))
        alt.sort()
        if alt and alt[0][0] <= 3:
            akcje.append(dict(id="R9", cat="agro", layer="gleba", title=f"Rozważ: {alt[0][1].lower()}",
                              where="cała działka", when="przy planowaniu płodozmianu",
                              cause=f"{u.nazwa.lower()} przekraczała próg suszy {F5}/10 razy",
                              gain=f"na tej glebie {alt[0][1].lower()} — {alt[0][0]}/10 sezonów z suszą",
                              why="Porównanie progów IUNG dla różnych upraw na tej samej glebie i pogodzie z 10 sezonów.",
                              chips=["progi IUNG", "10 sezonów"],
                              steps=[f"Sprawdź, czy {alt[0][1].lower()} pasuje do Twojego płodozmianu, sprzętu i zbytu.",
                                     "Na początek spróbuj na części działki i porównaj plon w suchym roku."]))

    plan_s = zysk(plan_all) if (plan_all.mulcz or plan_all.nawadniaj or plan_all.dawka_teraz or plan_all.cn_minus) else base

    # susza hydrologiczna (IMGW, L3) zmienia zalecenia nawadniania: rzeki w regionie poniżej SNQ – pobór z cieku niepewny
    if ostrz:
        for a in akcje:
            if a["id"] in ("R7", "R8"):
                a["why"] += f" {ostrz_txt}. Nie planuj poboru wody z cieku — sprawdź studnię lub zbiornik."
                a["chips"] = a.get("chips", []) + ["susza hydrologiczna (IMGW)"]
                a["steps"] = ["IMGW ostrzega o suszy hydrologicznej w regionie — nie licz na pobór wody z rzeki ani rowu; "
                              "sprawdź studnię lub własny zbiornik."] + a.get("steps", [])

    # numeracja w kolejności KOWR: retencja → pole → nawadnianie
    order = {"ret": 0, "agro": 1, "irr": 2}
    akcje.sort(key=lambda a: (order[a["cat"]], a["id"]))
    pins = out["dzialka"]["svg"]["pins"]
    tr_map, _, _ = projekcja(d["rings"])
    for i, a in enumerate(akcje):
        a["n"] = i + 1
        ll = a.pop("lonlat", None)
        if not ll:                        # działanie dla całej działki – punkt wewnątrz działki (rozłożone, by się nie nakładały)
            gp = geo.grid_points(d["rings"], 5)
            ll = gp[(i * 3 + 1) % len(gp)] if gp else geo.centroid(d["rings"])
            a["ogolny_punkt"] = True      # pinezkę można przenieść na część uprawną (analizuj_dzialke)
        a["punkt"] = [round(float(ll[0]), 6), round(float(ll[1]), 6)]
        p = pin_pct(tr_map, *ll)
        a["x"], a["y"] = p["x"], p["y"]
    real = [a for a in akcje if not a.get("mock") and a["id"] != "R7-"]
    pilne = next((a for a in real if a["id"] == "R7"), None) \
        or (next((a for a in real if a["id"] in ("R1", "R2")), None) if ostrz else None) \
        or next((a for a in real if "teraz" in a["when"]), None) or (real[0] if real else None)

    # ---------------------------------------------------------------- diagnoza (5.1)
    Nn = base.get("N", N)
    a14 = round(base.get("f18_14", 0) * Nn)
    kbw_txt = ""
    if kbw.get("dostepny") and kbw.get("prog") is not None:
        kbw_txt = (" Spełnione kryterium suszy rolniczej IUNG." if kbw["susza"] else " Kryterium suszy IUNG nie jest spełnione.")

    # pewność: sygnały stanu na dzień D (pipeline 5.1) – liczone przed nagłówkiem, bo nagłówek opisuje stan (L4)
    sygn = []
    s1 = (kbw.get("susza") if kbw.get("dostepny") else None)
    if s1 is None and nP:
        s1 = P60 / nP < 0.7
    sygn.append(("opady / próg IUNG", s1))
    sygn.append(("woda w glebie (FAO‑56)", F4 < F4p))
    sygn.append(("rośliny z satelity", (sat["z_med"] < satellite.Z_SUCHO) if sat else None))
    sygn.append(("tło suszy EDO", (edo["klasa"] in ("ostrzeżenie", "alarm")) if edo else None))
    dost = [v for _, v in sygn if v is not None]
    zgodne = max(sum(dost), len(dost) - sum(dost)) if dost else 0
    pew = "wysoka" if zgodne >= 4 else "średnia" if zgodne >= 2 and len(dost) >= 2 else "niska"
    susza_teraz = bool(dost) and sum(dost) > len(dost) - sum(dost)

    # podatność z 10 lat (3.3 pkt 4): drugie zdanie raportu
    mies_top = [mm for mm, _ in mies.most_common(2)] if F5 else []
    if F5:
        pod_txt = (f"W {F5} z {len(hist_ok)} ostatnich sezonów brakowało wody"
                   + (f", najczęściej w {' i '.join(MIES_MIEJSC[x - 1] for x in sorted(mies_top))}" if mies_top else "") + ".")
    else:
        pod_txt = f"W żadnym z {len(hist_ok)} ostatnich sezonów nie przekroczono progu suszy."
    if w_sez:
        if base.get("f18_14", 0) >= C.PROG_SUSZA_NADCHODZI:
            status, kolor = "Susza", "#c2362f"
        elif base.get("f18_14", 0) >= C.PROG_ZAGROZENIE:
            status, kolor = "Zagrożenie", "#d97706"
        else:
            status, kolor = "Spokojnie", "#1E5B3A"
        if F4 < F4p and faza != "poza wegetacją":
            head = f"{u.nazwa} już cierpi — zapas wody poniżej progu stresu"
        elif status == "Susza":
            head = f"Za ok. {fmt(f18d or 0)} dni zapas wody spadnie poniżej progu stresu"
        elif status == "Zagrożenie":
            head = "W najbliższych 2 tygodniach możliwy stres wodny"
        else:
            head = "Wody wystarczy na najbliższe tygodnie"
        sub = (f"Dziś w glebie {fmt(100 * F4)}% wody dostępnej (stres poniżej {fmt(100 * F4p)}%). "
               f"W {a14} z {Nn} scenariuszy na najbliższe 2 tygodnie pojawi się stres.{kbw_txt} {pod_txt}")
        fut_head = "Co czeka działkę w najbliższych tygodniach"
        fut_note = (("Pierwsze dni z prognozy Open‑Meteo, dalej " if prog else "") +
                    f"pogoda z sezonów {min(base.get('lata', [0]))}–{max(base.get('lata', [0]))} (te same dni roku). "
                    "To „jak bywało”, nie prognoza pogody.")
    else:
        rok_n = horyzont_rok(D)
        status, kolor = f"Plan na {rok_n}", "#a35412"
        # nagłówek = stan na dzień D (L4); scenariusz na przyszły sezon jest w sekcji ryzyka
        head = (f"Dziś w glebie {fmt(100 * F4)}% wody dostępnej — "
                + ("suszy teraz nie ma" if F4 >= F4p and not susza_teraz else "wody jest mniej niż zwykle o tej porze"))
        sub = f"{pod_txt} Teraz najtaniej zatrzymać wodę z zimy."
        fut_head = f"Sezon {rok_n}: jak bywało w poprzednich latach"
        fut_note = (f"Start: dzisiejszy zapas {fmt(100 * F4)}%, dalej pogoda z sezonów {min(base.get('lata', [0]))}–"
                    f"{max(base.get('lata', [0]))}. To „jak bywało”, nie prognoza pogody.")
    fut_say = plan_efekt(base, plan_s, u, Nn, {a["id"] for a in akcje})

    # historia (kafelki)
    years = [{"y": str(h["rok"]), "crop": h["uprawa"], "tag": h.get("stopien", "—") if h.get("dostepny") else "—",
              "znana": h["uprawa_zr"] != "przyjęto bieżącą uprawę",
              "tip": (f"{h['uprawa_zr']} · KBW {h['kbw']} mm vs próg {fmt(h['prog'])} mm ({h['okres']}), dni stresu: {h['dni_stresu']}"
                      if h.get("prog") is not None else f"{h['uprawa_zr']} · bez progu IUNG — ocena z bilansu wody: {h['dni_stresu']} dni stresu")} for h in hist]

    # szczegóły dla doradcy
    det = []
    if kbw.get("dostepny"):
        det.append(f"Klimatyczny bilans wodny {kbw['okres']}{' (okres niepełny)' if kbw.get('niepelny') else ''}: "
                   f"opad {fmt(kbw['P'])} mm − ET0 (FAO‑56) {fmt(kbw['ET0'])} mm = <b>{fmt(kbw['kbw'])} mm</b>; "
                   f"próg suszy IUNG ({u.wiersz_iung}, kat. {['', 'I', 'II', 'III', 'IV', 'IV'][kat]}): <b>{fmt(kbw['prog'])} mm</b> (Rozp. MRiRW 2019)")
    else:
        det.append(f"KBW teraz: {kbw.get('powod', 'niedostępny')}")
    det.append(f"Zapas wody w strefie korzeni {fmt(TAW - Dr)} z {fmt(TAW)} mm ({fmt(100 * F4)}%), próg stresu (RAW, p={u.p}) "
               f"{fmt(100 * F4p)}% · bilans dobowy FAO‑56 od {m.dni[0]:%Y}, Kc dziś {kc:.2f} ({faza}), odpływ SCS‑CN λ=0,05, CN={CN}")
    if nP:
        det.append(f"Opad {a60:%d.%m}–{b60:%d.%m.%Y}: {fmt(P60)} mm vs średnia {C.LATA_NORMY} lat {fmt(nP)} mm; ET0 {fmt(E60)} vs {fmt(nE or 0)} mm; dni >30°C: {upal}")
    det.append(f"Historia {lata[0]}–{lata[-1]}: susza (próg IUNG, a dla upraw bez progu – dni stresu FAO‑56) w {F5} z {len(hist_ok)} sezonów"
               + (f", najczęściej w miesiącach: {', '.join(MIES[x - 1] for x, _ in mies.most_common(3))}" if mies else "")
               + f" (każdy sezon oceniony dla uprawy, która wtedy rosła: {n_upr_znane} z {len(hist)} lat z ARiMR / mapy upraw "
                 f"Copernicus, pozostałe – bieżąca uprawa)")
    if base.get("dostepny"):
        det.append(f"Prognoza scenariuszowa (ESP): bilans od dzisiejszego zapasu przez pogodę {Nn} sezonów "
                   f"{min(base['lata'])}–{max(base['lata'])}; {Nn} to mała próba — wyniki jako „x z {Nn}”")
    det.append(f"Deszcz w 7 dni: {fmt(F11)} mm ({F11_src})")
    if ter.get("dostepny"):
        det.append(f"Teren ({ter['zrodlo']}" + ("" if nmt else " – drzewa i budynki zawyżają spadki") + "): wysokość "
                   f"{fmt(ter['wys_min'])}–{fmt(ter['wys_max'])} m, średni spadek {fmt(ter['spadek_sr'])}%, 95. percentyl {fmt(ter['spadek_max'])}%; "
                   f"odpływ z ulew (SCS‑CN λ=0,05, CN={CN}) {fmt(100 * F7b)}% opadu"
                   + (f"; zagłębienie {fmt(F8['pow_ha'], 2)} ha, ok. {fmt(F8['objetosc_m3'])} m³" if F8 else "; brak zagłębień przy działce"))
    if edo:
        det.append(f"Europejskie Obserwatorium Suszy (CDI, dekada od {edo['dekada']}): <b>{edo['klasa']}</b> — {edo['opis']} "
                   "(siatka ok. 5 km, porównanie, nie warunek zaleceń)")
    if sg:
        det.append(f"Skład gleby (SoilGrids 250 m, 5–60 cm): piasek {fmt(sg['piasek'])}%, ił {fmt(sg['il'])}%, węgiel organiczny "
                   f"{fmt(sg['soc'], 1)}%; θ polowa {fmt(sg['theta_fc'], 2)}, θ więdnięcia {fmt(sg['theta_wp'], 2)} → ok. {fmt(sg['taw_1m'])} mm/m "
                   f"(do bilansu używamy WOD z kategorii IUNG: {fmt(C.WOD_MM[kat])} mm/m – SoilGrids bywa zawyżony dla piasków)")
    if sat:
        det.append(f"Wilgotność roślin NDMI ({sat.get('sensor', 'Sentinel‑2')}, {sat['data']}, chmury {fmt(sat['chmury'])}%, {sat['kafel']}): "
                   f"mediana {fmt(sat['ndmi_med'], 2)}, z‑score {fmt(sat['z_med'], 1)} względem tych samych dni w sezonach z tą samą "
                   f"grupą upraw ({sat.get('grupa', '—')}): "
                   + ", ".join(f"{y} ({c})" for y, c in sat.get("uprawy_ref", {}).items())
                   + f" — {sat['n_ref']} czystych scen; suszej niż zwykle (z < −1): {fmt(100 * sat['sucho_udzial'])}% działki")
    else:
        det.append(f"Wilgotność roślin NDMI: nie oceniamy — {powod_czytelny(wsat.powod)}")
    if najbl:
        det.append("Najbliższe wody (BDOT10k, od granicy działki): " + "; ".join(
            f"{x['typ']} {fmt(x['dist_m'])} m" for x in sorted(najbl.values(), key=lambda x: x["dist_m"])))
    if zl:
        det.append(f"Zlewnia elementarna (MPHP10k, Wody Polskie): „{zl['nazwa']}”"
                   + (f", ok. {fmt(zl['pow_km2'], 1)} km²" if zl["pow_km2"] else "") + " — przybliżenie zlewni rowu przy działce")
    if stacja:
        det.append(f"Najbliższy wodowskaz IMGW: {stacja['stacja']} ({stacja['rzeka'] or 'ciek bez nazwy'}), {fmt(stacja['dist_km'], 1)} km"
                   + (f" — stan {fmt(stacja['stan_cm'])} cm ({stacja['data']})" if stacja["stan_cm"] is not None else " — brak bieżącego pomiaru")
                   + (f"; stan ostrzegawczy {fmt(stacja['ostrzegawczy_cm'])} cm" if stacja["ostrzegawczy_cm"] is not None else "")
                   + " (API nie podaje przepływu niskiego SNQ, więc samym wodowskazem nie oceniamy niżówki)")
    if teraz_hydro and wos is not None and wos.ok:
        det.append(ostrz_txt if ostrz else "IMGW: brak aktywnego ostrzeżenia o suszy hydrologicznej dla województwa działki")
    det.append("Nie uwzględniono: wód gruntowych, drenowania, odmiany i terminu siewu, nawadniania już stosowanego")

    elapsed = time.perf_counter() - t0
    src_chips = [
        {"t": "granice — ULDK GUGiK", "ok": wd.ok},
        {"t": f"pogoda {m.dni[0]:%Y}–{Dm:%Y} — ERA5‑Land (Open‑Meteo)", "ok": wm.ok},
        {"t": "prognoza 16 dni — Open‑Meteo" if prog else "prognoza — średnie z 10 lat", "ok": True},
        {"t": "gleba — IUNG‑PIB", "ok": wi.ok},
        {"t": "progi suszy — IUNG (Rozp. MRiRW 2019)", "ok": True},
        {"t": f"uprawa — {zrodlo_uprawy}", "ok": True},
        {"t": f"satelita — {sat.get('sensor', 'Sentinel‑2')} ({sat['data']})" if sat else "satelita — brak zdjęcia", "ok": bool(sat)},
        {"t": "teren — " + ("NMT 1 m GUGiK" if nmt else "Copernicus DEM 30 m"), "ok": wdem.ok},
        {"t": "rowy i wody — BDOT10k", "ok": wh.ok},
        {"t": "skład gleby — SoilGrids", "ok": bool(sg)},
        {"t": f"tło suszy — EDO ({edo['klasa']})" if edo else "tło suszy — EDO", "ok": bool(edo)},
        {"t": "zlewnia — MPHP10k (Wody Polskie)", "ok": bool(zl)},
    ] + ([{"t": "rzeki i ostrzeżenia — IMGW‑PIB (bieżące)", "ok": bool(wws is not None and wws.ok and wos is not None and wos.ok)}]
         if teraz_hydro else [])
    out["surowe"] = {"rings": d["rings"], "ter": ter if ter.get("dostepny") else None, "sat": sat, "hyd": hyd,
                     "F8": F8, "F9": F9, "wyp": wyp, "kat": kat, "nmt": nmt, "pow_ha": d["pow_ha"]}
    out.update({
        "teren": svg_teren(d["rings"], ter, hyd) if ter.get("dostepny") else None,
        "sucho": svg_sucho(d["rings"], sat) if sat else None,
        "tryb": "sezon" if w_sez else "poza",
        "status": {"label": status, "kolor": kolor, "head": head, "sub": sub, "F4": F4, "F4p": F4p,
                   "pewnosc": pew, "sygnaly": [{"t": t, "v": v} for t, v in sygn]},
        "pilne": pilne and pilne["id"], "akcje": akcje, "przyczyny": przyczyny,
        "ryzyko": {"head": fut_head, "say": fut_say, "note": fut_note, "N": Nn,
                   "kolumny": base.get("kolumny", []), "bez": base.get("ryzyko", []), "plan": plan_s.get("ryzyko", [])},
        "historia": {"lata": years, "F5": F5, "n": len(hist_ok), "podatnosc": pod_txt,
                     "miesiace": [MIES_MIEJSC[x - 1] for x in sorted(mies_top)],
                     "opis": (f"Susza w {F5} z {len(hist_ok)} sezonów (gleba kat. {['', 'I', 'II', 'III', 'IV', 'IV'][kat]}; próg IUNG"
                              + (", a dla upraw bez progu – dni stresu wyraźnie ponad medianę z 10 lat" if bil else "") + ").")},
        "gleba": ({"kat": kat} | ({"piasek": sg["piasek"], "il": sg["il"], "soc": sg["soc"]} if sg else {})),
        "edo": edo,
        "fakty": {"F1": kbw, "F4": F4, "F4p": F4p, "TAW": TAW, "Dr": Dr, "kat": kat, "F5": F5, "F11": F11, "faza": faza,
                  "P60": P60, "normP60": nP, "upal": upal, "N": Nn,
                  "zlewnia": zl, "wodowskaz": stacja, "ostrzezenia_hydro": ostrz},
        "szczegoly": det, "braki": braki, "zrodla_chips": src_chips, "zrodla": zrodla,
        "czas_s": round(elapsed, 1),
    })
    return out


async def analizuj_dzialke(ident: str | None, lon: float | None, lat: float | None, D: date,
                           uprawa: str | None = None, wybor: list[dict] | None = None) -> dict:
    """Raport działki ewidencyjnej: jedna warstwa działkowa i po jednej warstwie uprawowej na każdą część.

    Działka niesie pogodę, glebę, teren i zlewnię, więc retencja (R1–R4) jest wspólna. Uprawa decyduje o
    bilansie FAO‑56, scenariuszach i zaleceniach polowych oraz nawodnieniowych, więc R5–R9 liczymy osobno
    dla każdej uprawy na działce. Źródła pobieramy raz (cache w net.get) – kolejna uprawa to ok. 2 s liczenia.
    """
    async with httpx.AsyncClient() as client:
        wd = await sources.dzialka(client, ident, lon, lat)
        if not wd.ok:
            return {"ok": False, "powod": wd.powod, "zrodla": [wd.opis()]}
        rings = wd.dane["rings"]
        ha_dz = wd.dane["pow_ha"]
        wcz = await czesci.czesci_dzialki(client, rings, D.year)

    lista = wcz.dane if wcz.ok else [
        {"id": "c1", "uprawa": "brak", "nazwa": "Brak uprawy", "roslina": None, "ha": round(ha_dz, 3), "udzial": 1.0,
         "geometria": None, "zrodlo": f"podział niedostępny ({wcz.powod}) — przyjęto brak uprawy; możesz zmienić",
         "pewne": False, "reczna": False}]
    lista = czesci.scal_wybor(lista, wybor, ha_dz)
    # Zgodność wstecz: klient, który zna tylko jedną uprawę, przysyła `uprawa` – dotyczy wtedy całej działki.
    if uprawa and not wybor:
        for c in lista:
            c["uprawa"], c["nazwa"], c["pewne"] = uprawa, UPRAWY[uprawa].nazwa, True
        lista = lista[:1]
        lista[0].update(ha=round(ha_dz, 3), udzial=1.0, zrodlo="wybrane przez rolnika")

    gotowe = czesci.do_analizy(lista)
    if not gotowe:
        return {"ok": False, "potrzebna_uprawa": True, "czesci": lista,
                "powod": "Nie wiemy, co rośnie na tej działce — wskaż uprawę albo wybierz „Brak uprawy”.",
                "zrodla": [wd.opis(), wcz.opis()]}

    # Części tej samej uprawy dają identyczny wynik – liczymy raz na uprawę. „brak” nie ma warstwy uprawowej.
    kolejnosc = sorted(gotowe, key=lambda c: -c["ha"])
    z_uprawa = [c for c in kolejnosc if c["uprawa"] != "brak"]
    wyniki: dict[str, dict] = {}
    for c in z_uprawa:
        if c["uprawa"] not in wyniki:
            wyniki[c["uprawa"]] = await analizuj(ident, lon, lat, D, c["uprawa"])

    tylko_brak = not z_uprawa
    if tylko_brak:
        # Jedna analiza działkowa (parametry jak „inna”) — bez zaleceń polowych w scalaniu.
        glowna = await analizuj(ident, lon, lat, D, "inna")
        wyniki["brak"] = glowna
    else:
        glowna = wyniki[z_uprawa[0]["uprawa"]]
    if not glowna.get("ok") or glowna.get("tryb") == "poza_zakresem":
        return glowna | {"czesci": lista}
    out = _scal_czesci(glowna, wyniki, kolejnosc, lista)
    if tylko_brak:
        out["status"] = status_bez_uprawy(out["status"])
        out["uprawa"] = {"key": "brak", "nazwa": "Brak uprawy", "zrodlo": "przyjęto brak uprawy", "okno": "—"}
        out["akcje"] = [a for a in out.get("akcje", []) if a.get("cat") == "ret" or a.get("czesc") is None]
    return out


def status_bez_uprawy(st: dict) -> dict:
    """Status działki, na której nic nie wskazano do uprawy. Pewność i sygnały dotyczą działki (pogoda, gleba,
    satelita), nie uprawy, więc zostają z analizy działkowej — raport ich potrzebuje (raport_front: confidence)."""
    return {"label": "Bez uprawy", "head": "Brak wskazanej uprawy na działce",
            "sub": "Pokazujemy teren, glebę i retencję. Wskaż uprawę, jeśli chcesz zalecenia polowe i podlewanie.",
            "pewnosc": st.get("pewnosc", "—"), "sygnaly": st.get("sygnaly", [])}


def _rings_czesci(c: dict) -> list | None:
    """Obrysy części uprawnej w formacie geo.* (otwory pomijamy – służą tylko do postawienia pinezki)."""
    g = c.get("geometria") or {}
    poly = g.get("coordinates") or []
    rings = [[(x, y) for x, y in p[0]] for p in poly if p and len(p[0]) >= 4]
    return rings or None


def _scal_czesci(glowna: dict, wyniki: dict[str, dict], kolejnosc: list[dict], lista: list[dict]) -> dict:
    """Jeden raport z przebiegów per uprawa: retencja z warstwy działkowej, reszta zaleceń przypisana do części."""
    out = dict(glowna)
    akcje = [a | {"czesc": None} for a in glowna["akcje"] if a["cat"] == "ret"]
    czesci_out, braki = [], list(glowna.get("braki", []))
    for c in kolejnosc:
        w = wyniki[c["uprawa"]]
        if not w.get("ok"):
            continue
        # „Brak uprawy”: zostaje warstwa działkowa (retencja), bez R5–R8.
        if c["uprawa"] == "brak":
            czesci_out.append({k: c[k] for k in ("id", "ha", "udzial", "geometria", "zrodlo", "pewne", "reczna")} | {
                "uprawa": {"key": "brak", "nazwa": "Brak uprawy", "zrodlo": c.get("zrodlo", ""), "okno": "—"},
                "status": {"label": "Bez uprawy", "head": "Brak wskazanej uprawy",
                           "sub": "Liczymy retencję i teren dla całej działki. Wskaż uprawę, jeśli chcesz zalecenia polowe."},
                "reguly": [], "fakty": {}, "szczegoly": []})
            continue
        moje = [a | {"czesc": c["id"]} for a in w["akcje"] if a["cat"] != "ret"]
        # zalecenie polowe dotyczy tej uprawy, więc pinezka ma stać na jej części działki
        gp_c = geo.grid_points(_rings_czesci(c), 3) if _rings_czesci(c) else []
        for k, a in enumerate([x for x in moje if x.get("ogolny_punkt")]):
            if gp_c:
                ll = gp_c[(k * 2) % len(gp_c)]
                a["punkt"] = [round(float(ll[0]), 6), round(float(ll[1]), 6)]
        akcje += moje
        czesci_out.append({k: c[k] for k in ("id", "ha", "udzial", "geometria", "zrodlo", "pewne", "reczna")} | {
            "uprawa": w["uprawa"], "status": w["status"], "ryzyko": w.get("ryzyko"), "historia": w.get("historia"),
            "fakty": {k: w["fakty"][k] for k in ("F1", "F4", "F4p", "TAW", "F5", "faza") if k in w["fakty"]},
            "szczegoly": w.get("szczegoly", []), "reguly": [a["id"] for a in moje]})
    # Część bez uprawy też trafia do raportu (bez zaleceń polowych) — inaczej powierzchnie nie sumują się do działki.
    for c in czesci.bez_uprawy(lista):
        braki.append(f"{c['ha']:.2f} ha działki bez wskazanej uprawy ({c['zrodlo']}) — ta część nie ma zaleceń polowych"
                     .replace(".", ",", 1))
        czesci_out.append({k: c[k] for k in ("id", "ha", "udzial", "geometria", "zrodlo", "pewne", "reczna")} | {
            "uprawa": None, "reguly": [],
            "status": {"label": "Bez uprawy", "head": "Nie wiemy, co tu rośnie",
                       "sub": "Wskaż uprawę dla tej części, a policzymy dla niej zapas wody i zalecenia polowe."}})

    akcje.sort(key=lambda a: (a["czesc"] is not None, a.get("n", 99)))
    for i, a in enumerate(akcje):
        a["n"] = i + 1
    real = [a for a in akcje if not a.get("mock") and a["id"] != "R7-"]
    pilne = next((a for a in real if a["id"] == "R7"), None) \
        or next((a for a in real if "teraz" in a["when"]), None) or (real[0] if real else None)
    out.update(akcje=akcje, czesci=czesci_out, braki=braki, pilne=pilne and pilne["id"],
               pilne_n=pilne and pilne["n"])
    return out


def horyzont_rok(D: date) -> int:
    return D.year + 1 if D.month >= 10 else D.year


def poza_zakresem(co: str) -> dict:
    return {"tryb": "poza_zakresem", "status": {"label": "Poza zakresem", "kolor": "#5F625B",
            "head": "To nie jest grunt rolny — ocena rolnicza niedostępna",
            "sub": f"Według mapy IUNG‑PIB większość działki to: {co}.", "F4": None, "F4p": None,
            "pewnosc": "—", "sygnaly": []}, "akcje": [], "przyczyny": [], "pilne": None,
            "ryzyko": None, "historia": None, "szczegoly": [], "braki": [], "zrodla_chips": []}
