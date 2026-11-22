"""Tłumaczenie wyniku analizy (analysis.analizuj) na kształt `Report` frontendu Next.js (frontend/src/lib/types.ts).

Mapa: rastry `teren` (klasy wysokości DEM/NMT), `sucho` (klasy z‑score NDMI), `gleba` (kategoria IUNG) jako regularne
siatki lon/lat z wartościami klas (−1 = poza działką) oraz obiekty GeoJSON (rowy, zagłębienie, strefa podlewania, spływ).
"""
from __future__ import annotations

import math
import re
from datetime import date

from . import geo
from .crops import UPRAWY

CROP_HINT = {"kukurydza": "na ziarno lub kiszonkę", "pszenica": "pszenica, żyto, pszenżyto", "jare": "jęczmień, owies",
             "laka": "trwałe użytki zielone", "inna": "warzywa, sady, strączkowe"}
FAKTY = {"R1": ["F9", "F5"], "R2": ["F8", "F5"], "R3": ["F7", "F7b"], "R4": ["F9b"], "R5": ["F6", "F6c"], "R6": ["F7"],
         "R7": ["F4", "F11", "F12", "F10"], "R7-": ["F4", "F11"], "R8": ["F18", "F19", "F10"], "R9": ["F5"]}
TONE = {"Susza": "susza", "Zagrożenie": "zagrozenie", "Spokojnie": "spokojnie", "Poza zakresem": "poza-zakresem",
        "Bez uprawy": "poza-zakresem"}
POKRYCIE = {11: "las", 12: "woda", 13: "zabudowa", 14: "drogi"}
MIESIACE = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września",
            "października", "listopada", "grudnia"]
TAGI = {"skrajna", "silna", "umiark.", "lekka", "brak"}
AKTUALNE = ("granice", "rowy", "teren", "gleba — IUNG")   # dane w stanie obecnym (bez historii)


def _ring(rings):
    return max(rings, key=len)


def _bez_html(t: str) -> str:
    return re.sub(r"<[^>]+>", "", t)


def _crop(key: str | None) -> dict | None:
    u = UPRAWY.get(key or "")
    if not u:
        return None
    return {"id": u.key, "name": u.nazwa, "hint": CROP_HINT.get(u.key, ""), "hasOfficialThreshold": bool(u.wiersz_iung)}


# ---------------------------------------------------------------- rastry
def _raster_teren(ter: dict) -> dict | None:
    pts = [c for c in ter["siatka"] if c[4]]
    if not pts:
        return None
    kl, kt = ter["krok"]
    lons = sorted({round(c[0], 9) for c in ter["siatka"]})
    lats = sorted({round(c[1], 9) for c in ter["siatka"]}, reverse=True)
    zin = sorted(c[2] for c in pts)
    q = [zin[int(len(zin) * f)] for f in (0.2, 0.4, 0.6, 0.8)]
    klasa = lambda z: 4 - sum(1 for t in q if z > t)          # 0 najwyżej … 4 najniżej
    idx = {(round(c[0], 9), round(c[1], 9)): c for c in ter["siatka"]}
    vals = []
    for la in lats:
        for lo in lons:
            c = idx.get((lo, la))
            vals.append(klasa(c[2]) if c else -1)
    cell_m = round(kt * 110574)
    return {"bbox": [lons[0] - kl / 2, lats[-1] - kt / 2, lons[-1] + kl / 2, lats[0] + kt / 2],
            "cols": len(lons), "rows": len(lats), "values": vals, "cellM": cell_m}


def _klasa_z(z: float) -> int:
    return 0 if z >= 0.6 else 1 if z > -0.5 else 2 if z > -1.25 else 3 if z > -2 else 4


def _raster_sucho(sat: dict) -> dict | None:
    px = sat.get("piksele") or []
    if not px:
        return None
    pm = sat.get("piksel_m", 20)
    lat0 = sum(p[1] for p in px) / len(px)
    dx, dy = pm / (111320 * math.cos(math.radians(lat0))), pm / 110574
    w0, s0 = min(p[0] for p in px) - dx / 2, min(p[1] for p in px) - dy / 2
    cols = int((max(p[0] for p in px) - w0) / dx) + 1
    rows = int((max(p[1] for p in px) - s0) / dy) + 1
    vals = [-1] * (cols * rows)
    for lo, la, z in px:
        i, j = rows - 1 - int((la - s0) / dy), int((lo - w0) / dx)
        if 0 <= i < rows and 0 <= j < cols:
            vals[i * cols + j] = _klasa_z(z)
    return {"bbox": [w0, s0, w0 + cols * dx, s0 + rows * dy], "cols": cols, "rows": rows, "values": vals, "cellM": pm}


def _raster_gleba(rings, kat: int) -> dict:
    x0, y0, x1, y1 = geo.bbox(rings)
    cols = 24
    lat0 = (y0 + y1) / 2
    dx = (x1 - x0) / cols
    dy = dx * math.cos(math.radians(lat0)) * 111320 / 110574       # kwadratowe komórki w metrach
    rows = max(1, int(math.ceil((y1 - y0) / dy)))
    klasa = 2 if kat == 1 else 1 if kat == 2 else 0                 # 0 glina · 1 piasek gliniasty · 2 piasek
    vals = []
    for i in range(rows):
        for j in range(cols):
            pts = [(x0 + (j + fx) * dx, y1 - (i + fy) * dy) for fx in (0, 0.5, 1) for fy in (0, 0.5, 1)]
            vals.append(klasa if any(geo.inside_any(p, rings) for p in pts) else -1)
    return {"bbox": [x0, y1 - rows * dy, x1, y1], "cols": cols, "rows": rows, "values": vals,
            "cellM": round(dx * math.cos(math.radians(lat0)) * 111320)}


# ---------------------------------------------------------------- obiekty mapy
def _kolo(lon, lat, pow_ha, n=24):
    r = math.sqrt(pow_ha * 1e4 / math.pi)
    k = 111320 * math.cos(math.radians(lat))
    pts = [[round(lon + r * math.cos(2 * math.pi * t / n) / k, 6), round(lat + r * math.sin(2 * math.pi * t / n) / 110574, 6)]
           for t in range(n)]
    return pts + [pts[0]]


def _otoczka(pts):
    pts = sorted(set(pts))
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


def _mapa(out: dict, sur: dict, reguly: set) -> dict:
    rings = sur["rings"]
    feats, labels, rasters = [], [], {}
    ter, sat, hyd, F8, wyp = sur.get("ter"), sur.get("sat"), sur.get("hyd"), sur.get("F8"), sur.get("wyp")
    if ter:
        rasters["teren"] = _raster_teren(ter)
    if sat:
        rasters["sucho"] = _raster_sucho(sat)
    rasters["gleba"] = _raster_gleba(rings, sur.get("kat", 2))
    # Rowy i cieki: tylko w pobliżu działki (tło), a jako zastawkę (R1) wyróżniony tylko najbliższy rów.
    cx, cy = geo.centroid(rings)
    kx, ky = 111320 * math.cos(math.radians(cy)), 110574
    gran = [((x - cx) * kx, (y - cy) * ky) for x, y in _ring(rings)]
    def odl(c):                       # najmniejsza odległość wierzchołków linii od wierzchołków granicy (m, przybliżenie)
        return min(math.hypot((x - cx) * kx - gx, (y - cy) * ky - gy) for x, y in c for gx, gy in gran)
    F9 = sur.get("F9")
    linie = [l for l in (hyd or {}).get("linie", []) if l["typ"] in ("SWRM_L", "SWKN_L", "SWRS_L") and len(l["c"]) >= 2]
    blisko = [(l, odl(l["c"])) for l in linie]
    blisko = [(l, d) for l, d in blisko if d <= 150]
    r1 = None
    if "R1" in reguly and F9:
        r1 = min((l for l, _ in blisko if l["typ"] != "SWRS_L"),
                 key=lambda l: min(math.hypot((x - F9["lon"]) * kx, (y - F9["lat"]) * ky) for x, y in l["c"]), default=None)
    # tło: tylko te fragmenty rowów, które leżą ≤ 150 m od granicy działki
    import numpy as np
    def gesto_m(c, krok):
        out = []
        for (x1, y1), (x2, y2) in zip(c[:-1], c[1:]):
            n = max(1, int(math.hypot((x2 - x1) * kx, (y2 - y1) * ky) / krok))
            out += [(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n) for k in range(n)]
        return out + [tuple(c[-1])]
    gr = np.array([((x - cx) * kx, (y - cy) * ky) for x, y in gesto_m(_ring(rings) + [_ring(rings)[0]], 10)])
    for l, _ in blisko:
        pts = gesto_m(l["c"], 5)
        xy = np.array([((x - cx) * kx, (y - cy) * ky) for x, y in pts])
        dmin = np.sqrt(((xy[:, None, :] - gr[None, :, :]) ** 2).sum(-1)).min(1)
        odc = []
        for (x, y), dd in zip(pts, dmin):
            if dd <= 150:
                odc.append([round(x, 6), round(y, 6)])
            elif odc:
                if len(odc) >= 2:
                    feats.append({"kind": "row", "regula": None, "geometry": {"type": "LineString", "coordinates": odc}, "layers": ["plan", "teren"]})
                odc = []
        if len(odc) >= 2:
            feats.append({"kind": "row", "regula": None, "geometry": {"type": "LineString", "coordinates": odc}, "layers": ["plan", "teren"]})
    if r1 is not None:                # zastawka: tylko odcinek rowu ~120 m wokół punktu najbliżej działki
        gesto = []
        for (x1, y1), (x2, y2) in zip(r1["c"][:-1], r1["c"][1:]):
            n = max(1, int(math.hypot((x2 - x1) * kx, (y2 - y1) * ky) / 5))
            gesto += [(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n) for k in range(n)]
        gesto.append(tuple(r1["c"][-1]))
        odc = [[round(x, 6), round(y, 6)] for x, y in gesto if math.hypot((x - F9["lon"]) * kx, (y - F9["lat"]) * ky) <= 60]
        if len(odc) >= 2:
            feats.append({"kind": "row", "regula": "R1", "geometry": {"type": "LineString", "coordinates": odc},
                          "layers": ["plan", "teren"]})
    if F8:
        obrys = F8.get("obrys") or _kolo(F8["lon"], F8["lat"], F8["pow_ha"])
        feats.append({"kind": "zaglebienie", "regula": "R2" if "R2" in reguly else None,
                      "geometry": {"type": "Polygon", "coordinates": [obrys]}, "layers": ["plan", "teren"]})
        labels.append({"punkt": [F8["lon"], F8["lat"]], "text": f"zagłębienie ~{round(F8['objetosc_m3'], -1):.0f} m³",
                       "layers": ["teren"], "tone": "blue", "minor": True})
    if sat and sat.get("sucho_ha", 0) >= 0.2:
        suche = [(p[0], p[1]) for p in sat["piksele"] if p[2] < -1.0]
        h = _otoczka(suche)
        if h:
            feats.append({"kind": "strefa-podlewania", "regula": "R7" if ("R7" in reguly or "R8" in reguly) else None,
                          "geometry": {"type": "Polygon", "coordinates": [h]}, "layers": ["plan", "sucho"]})
    if wyp:
        cx, cy = geo.centroid(rings)
        feats.append({"kind": "splyw", "regula": "R3" if "R3" in reguly else None,
                      "geometry": {"type": "LineString", "coordinates": [[round(cx, 6), round(cy, 6)], [round(wyp["lon"], 6), round(wyp["lat"], 6)]]},
                      "layers": ["teren"]})
    rasters = {k: v for k, v in rasters.items() if v}
    return {"features": feats, "rasters": rasters, "labels": labels}


def _map_info(out: dict, sur: dict) -> dict:
    ter, sat = sur.get("ter"), sur.get("sat")
    akcje = out.get("akcje") or []
    gleba = out.get("gleba") or {}
    kat = sur.get("kat", 2)
    info = {
        "plan": {"say": f"{len(akcje)} działań: najpierw zatrzymaj wodę, potem pole, na końcu nawadnianie." if akcje
                 else "Nie widzimy potrzeby działań — obserwuj stan w kolejnych tygodniach.",
                 "src": "Kliknij numer, aby zobaczyć, dlaczego właśnie tam."},
        "gleba": {"say": f"Kategoria podatności gleby na suszę: {['', 'I', 'II', 'III', 'IV', 'gleba organiczna'][kat]}"
                         + (f" · ok. {gleba['piasek']:.0f}% piasku, {gleba['soc']:.1f}% węgla" if gleba.get("piasek") is not None else "") + ".",
                  "src": "Kategorie podatności gleb na suszę IUNG‑PIB · skład gleby ISRIC SoilGrids 250 m"},
    }
    if ter:
        info["teren"] = {"say": f"Wysokość {ter['wys_min']:.0f}–{ter['wys_max']:.0f} m n.p.m., średni spadek {ter['spadek_sr']:.1f}%."
                                + (" Linia pokazuje, którędy woda z ulew opuszcza działkę." if ter.get("wyplyw") else ""),
                         "src": f"{ter.get('zrodlo', 'model terenu')} · rowy i wody: BDOT10k (stan obecny)"}
    else:
        info["teren"] = {"say": "Model terenu niedostępny.", "src": "Copernicus DEM 30 m / NMT GUGiK 1 m"}
    if sat:
        y, m, d = sat["data"].split("-")
        say = (f"Suszej niż zwykle jest ok. {sat['sucho_ha']:.1f} ha działki — tam w pierwszej kolejności woda."
               if sat["sucho_ha"] >= 0.2 else "Cała działka jest suszsza niż zwykle." if sat["z_med"] < -1
               else "Rośliny mają wilgotność typową dla tej pory roku.")
        ref = ", ".join(f"{yy} ({c})" for yy, c in (sat.get("uprawy_ref") or {}).items()) \
            or ", ".join(map(str, sat["lata_ref"]))
        info["sucho"] = {"say": say, "src": f"Wilgotność roślin (NDMI) z {sat.get('sensor', 'Sentinel‑2')}, {d}.{m}.{y}, "
                                            f"w porównaniu z tymi samymi dniami w sezonach z tą samą grupą upraw: {ref}"}
    else:
        powod = next((b for b in out.get("braki", []) if b.startswith("stan roślin")), "brak bezchmurnego zdjęcia")
        info["sucho"] = {"say": "Brak porównania satelitarnego — " + powod.removeprefix("stan roślin z satelity niedostępny: ") + ".",
                         "src": "Sentinel‑2 / Landsat · porównujemy tylko sezony z tą samą grupą upraw"}
    return info


# ---------------------------------------------------------------- raport
def _dlugo(iso: str) -> str:
    y, m, d = map(int, iso.split("-"))
    return f"{d} {MIESIACE[m - 1]} {y}"


def _parcel(out: dict, sur: dict, pokrycie: str = "rolny") -> dict:
    dz = out["dzialka"]
    ring = _ring(sur["rings"])
    return {"id": dz["id"], "number": dz["numer"], "gmina": dz["gmina"], "obreb": dz["obreb"],
            "wojewodztwo": dz.get("wojewodztwo") or "", "areaHa": dz["pow_ha"],
            "landUse": "grunty rolne" if pokrycie in ("rolny", "organiczna") else pokrycie,
            "landCover": pokrycie, "geometry": [[round(x, 6), round(y, 6)] for x, y in ring]}


def _sources(out: dict, today: str) -> list[dict]:
    res = []
    for i, c in enumerate(out.get("zrodla_chips", [])):
        ok = c.get("ok", False)
        state = "missing" if not ok else "current" if any(k in c["t"] for k in AKTUALNE) else "ok"
        what, _, src = c["t"].partition(" — ")
        res.append({"id": f"S{i + 1}", "what": what[:1].upper() + what[1:], "source": (src or None) if ok else None,
                    "state": state, "note": "stan obecny, nie z dnia analizy" if state == "current" else None,
                    "fetchedAt": today if ok else None})
    return res


def _not_checked(braki: list[str]) -> list[dict]:
    res = []
    for b in braki:
        m = re.split(r"\s+—\s+|:\s+", b, maxsplit=1)
        res.append({"what": m[0], "why": m[1] if len(m) > 1 else ""})
    return res


def _parts(out: dict) -> list[dict]:
    """Części uprawne działki: uprawa, powierzchnia i stan wody dla każdej z nich (sekcje raportu)."""
    res = []
    for c in out.get("czesci", []):
        st, f = c.get("status") or {}, c.get("fakty") or {}
        res.append({
            "id": c["id"], "crop": _crop((c.get("uprawa") or {}).get("key")),
            "cropSource": (c.get("uprawa") or {}).get("zrodlo", ""), "cropSplitSource": c.get("zrodlo", ""),
            "areaHa": round(c.get("ha", 0.0), 2), "sharePct": round(100 * c.get("udzial", 0.0)),
            "manual": bool(c.get("reczna")), "confirmed": bool(c.get("pewne")),
            "geometry": (c.get("geometria") or {}).get("coordinates"),
            "status": {"label": st.get("label", ""), "tone": TONE.get(st.get("label", ""),
                                                                      "plan" if str(st.get("label", "")).startswith("Plan") else "spokojnie")},
            "headline": st.get("head", ""), "summary": st.get("sub", ""),
            "soilWaterPct": round(100 * f["F4"]) if f.get("F4") is not None else None,
            "stressThresholdPct": round(100 * f["F4p"]) if f.get("F4p") is not None else None,
            "rules": c.get("reguly", []),
        })
    return res


def do_raportu(out: dict, today: str, od: str | None = None) -> dict:
    sur = out.get("surowe") or {}
    D = out["data"]
    if out.get("tryb") == "poza_zakresem":
        pokrycie = POKRYCIE.get(sur.get("pokrycie_kod"), "zabudowa")
        info = {k: {"say": "", "src": ""} for k in ("plan", "sucho", "teren", "gleba")}
        return {"parcel": _parcel(out, sur, pokrycie), "map": {"features": [], "rasters": {}, "labels": []}, "period": None,
                "crop": None, "cropSource": "", "date": D, "dateLong": _dlugo(D), "isToday": D == today,
                "season": "sezon" if "03-21" <= D[5:] <= "09-30" else "poza-sezonem", "yearsLabel": "", "scenarios": 0,
                "soilWaterPct": None, "stressThresholdPct": None,
                "status": {"label": "Poza zakresem", "tone": "poza-zakresem"}, "headline": out["status"]["head"],
                "summary": out["status"]["sub"], "confidence": {"level": "niska", "agreeing": 0, "total": 0, "note": None},
                "urgent": None, "actions": [], "parts": [], "mapInfo": info, "causes": [], "risk": None, "vulnerability": None,
                "justification": None,
                "sources": _sources(out, today), "notChecked": [], "advisorDetails": []}

    st = out["status"]
    akcje = out["akcje"]
    reguly = {a["id"] for a in akcje}
    lata = [y["y"] for y in (out.get("historia") or {}).get("lata", [])]
    syg = st.get("sygnaly", [])
    dost = [g["v"] for g in syg if g["v"] is not None]
    zgod = max(sum(dost), len(dost) - sum(dost)) if dost else 0
    brak = [g["t"] for g in syg if g["v"] is None]
    pil = next((a for a in akcje if a["n"] == out.get("pilne_n")), None) \
        or next((a for a in akcje if a["id"] == out.get("pilne")), None)
    tone = TONE.get(st["label"], "plan" if st["label"].startswith("Plan") else "spokojnie")
    kbw = out.get("fakty", {}).get("F1", {})
    if kbw.get("dostepny") and kbw.get("prog") is not None:
        iung = (f"KBW {kbw['okres']}: {kbw['kbw']:.0f} mm, próg IUNG {kbw['prog']:.0f} mm — kryterium suszy "
                f"{'spełnione' if kbw['susza'] else 'niespełnione'}.")
    else:
        iung = f"Kryterium IUNG teraz: {kbw.get('powod', 'niedostępne')}."
    hist = out.get("historia") or {}
    notc = _not_checked(out.get("braki", []))
    if od:
        notc.append({"what": f"podsumowanie okresu {od} – {D}", "why": "zalecenia liczymy dla dnia D; podsumowanie okresu — w przygotowaniu"})
    r = out.get("ryzyko")
    return {
        "parcel": _parcel(out, sur),
        "map": _mapa(out, sur, reguly),
        "period": None,
        "crop": _crop(out["uprawa"]["key"]),
        "cropSource": out["uprawa"]["zrodlo"],
        "date": D, "dateLong": _dlugo(D), "isToday": D == today,
        "season": "sezon" if out.get("tryb") == "sezon" else "poza-sezonem",
        "yearsLabel": f"{lata[0]}–{lata[-1]}" if lata else "",
        "scenarios": (r or {}).get("N", 10),
        "soilWaterPct": round(100 * st["F4"]) if st.get("F4") is not None else None,
        "stressThresholdPct": round(100 * st["F4p"]) if st.get("F4p") is not None else None,
        "status": {"label": st["label"], "tone": tone},
        "headline": st["head"], "summary": st["sub"],
        "confidence": {"level": st["pewnosc"] if st["pewnosc"] in ("wysoka", "średnia", "niska") else "niska",
                       "agreeing": zgod, "total": len(dost), "note": ("brak: " + ", ".join(brak)) if brak else None},
        "urgent": {"n": pil["n"], "label": "PILNE TERAZ" if pil["id"] == "R7" else "NAJLEPIEJ TERAZ",
                   "title": pil["title"], "sub": pil["when"]} if pil else None,
        "actions": [{
            "regula": a["id"], "co": a["title"], "gdzie": a["where"], "kiedy": a["when"],
            "ile": next((c for c in a.get("chips", []) if re.search(r"\d", c) and ("mm" in c or "m³" in c)), None),
            "bo": [a["cause"]], "co_zyskasz": a["gain"], "fakty": FAKTY.get(a["id"], []), "n": a["n"],
            "kategoria": a["cat"], "punkt": a["punkt"], "warstwa": a["layer"] if a["layer"] in ("plan", "sucho", "teren", "gleba") else "plan",
            "dlaczego": a["why"], "tagi": a.get("chips", []), "kroki": a.get("steps", []),
            "czesc": a.get("czesc"),
        } for a in akcje],
        "parts": _parts(out),
        "mapInfo": _map_info(out, sur),
        "causes": [{"id": c["id"], "name": c["name"], "evidence": c["ev"], "level": c["lvl"], "icon": c["icon"],
                    "color": c["color"], "layer": c.get("map")} for c in out.get("przyczyny", [])],
        "risk": {"head": r["head"], "say": r["say"], "note": r["note"], "cols": r["kolumny"],
                 "noAction": r["bez"], "withPlan": r["plan"]} if r else None,
        # podatność z 10 lat (3.3 pkt 4) – widoczna sekcja zaraz po stanie na dzień D (L4)
        "vulnerability": {"drought": hist.get("F5", 0), "seasons": hist.get("n", 0), "months": hist.get("miesiace", []),
                          "text": hist.get("podatnosc", "")} if hist else None,
        "justification": {"iungNow": iung,
                          "history": [{"year": int(y["y"]), "crop": y["crop"], "tag": y["tag"] if y["tag"] in TAGI else "brak",
                                       "note": y.get("tip", ""), "cropKnown": bool(y.get("znana"))}
                                      for y in hist.get("lata", [])],
                          "historyNote": hist.get("opis", "")} if hist else None,
        "sources": _sources(out, today),
        "notChecked": notc,
        "advisorDetails": [_bez_html(t) for t in out.get("szczegoly", [])],
    }
