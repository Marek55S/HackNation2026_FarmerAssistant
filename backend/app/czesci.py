"""Podział działki ewidencyjnej na części uprawne.

Działka ewidencyjna jest jednostką prawną i hydrologiczną – to dla niej liczymy pogodę, glebę, teren i zlewnię.
Uprawa jest tylko tym, co na działce akurat rośnie, i bywa, że na jednej działce rosną różne rzeczy.
Dlatego analiza ma jedną warstwę działkową i po jednej warstwie uprawowej na każdą część.

Źródła podziału, w kolejności zaufania:
1. deklaracje ARiMR (GSA) przycięte do granic działki – pewne, ale usługa WFS obejmuje tylko 2025–2026,
2. mapa upraw Copernicus CLMS 10 m – 2017–2024, podział z dominant pikseli, dokładność rastra,
3. reszta działki bez pokrycia oraz lata bez obu źródeł – uprawę podaje rolnik.
"""
from __future__ import annotations

from . import config as C
from . import cdse, geo, sources
from .crops import UPRAWY, z_arimr
from .net import Wynik


# ---------------------------------------------------------------- geometria (shapely)
def _geom(rings):
    """Pierścienie [(lon, lat), …] → geometria shapely. `buffer(0)` naprawia samoprzecięcia z WFS."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    polys = []
    for r in rings:
        if len(r) >= 4:
            p = Polygon(r)
            if not p.is_valid:
                p = p.buffer(0)
            if not p.is_empty:
                polys.append(p)
    return unary_union(polys) if polys else None


def _polygony(g):
    """Geometria shapely → lista wielokątów (pomija punkty i linie z przecięć stycznych)."""
    if g is None or g.is_empty:
        return []
    return [p for p in getattr(g, "geoms", [g]) if p.geom_type == "Polygon" and not p.is_empty]


def _rings(g, prec: int = 6) -> list[list[tuple[float, float]]]:
    """Zewnętrzne pierścienie – dla kodu, który operuje na obrysach (geo.area_m2, geo.bbox)."""
    out = []
    for p in _polygony(g):
        r = [(round(x, prec), round(y, prec)) for x, y in p.exterior.coords]
        if len(r) >= 4:
            out.append(r)
    return out


def _wspolrzedne(g, prec: int = 6) -> list[list[list[list[float]]]]:
    """Geometria shapely → współrzędne GeoJSON MultiPolygon, z otworami (reszta działki bywa pierścieniem)."""
    out = []
    for p in _polygony(g):
        polig = []
        for ring in [p.exterior, *p.interiors]:
            r = [[round(x, prec), round(y, prec)] for x, y in ring.coords]
            if len(r) >= 4:
                polig.append(r)
        if polig:
            out.append(polig)
    return out


def _ha(g) -> float:
    """Powierzchnia w ha: obrys minus otwory (geo.area_m2 liczy każdy pierścień jako dodatni)."""
    m2 = 0.0
    for p in _polygony(g):
        m2 += geo.area_m2([list(p.exterior.coords)])
        m2 -= sum(geo.area_m2([list(r.coords)]) for r in p.interiors)
    return max(m2, 0.0) / 1e4


def przytnij(dz, rings):
    """Część wspólna działki i wielokąta źródła: geometria + powierzchnia w ha (liczona na sferze)."""
    g = _geom(rings)
    if g is None or dz is None:
        return None, 0.0
    cz = dz.intersection(g)
    return (cz, _ha(cz)) if _polygony(cz) else (None, 0.0)


# ---------------------------------------------------------------- budowa części
def _czesc(i: int, uprawa: str | None, roslina: str | None, g, ha: float, ha_dz: float,
           zrodlo: str, pewne: bool, reczna: bool = False) -> dict:
    return {"id": f"c{i}", "uprawa": uprawa, "nazwa": UPRAWY[uprawa].nazwa if uprawa else None,
            "roslina": roslina, "ha": round(ha, 3), "udzial": round(ha / ha_dz, 4) if ha_dz else 0.0,
            "geometria": {"type": "MultiPolygon", "coordinates": _wspolrzedne(g)} if g is not None else None,
            "zrodlo": zrodlo, "pewne": pewne, "reczna": reczna}


def _drobny(ha: float, ha_dz: float) -> bool:
    """Skrawek z niedokładności granic deklaracji względem ewidencji, a nie osobna uprawa."""
    return ha < C.CZESC_MIN_HA and (not ha_dz or ha / ha_dz < C.CZESC_MIN_UDZIAL)


def _scal_po_uprawie(pola: list[dict]) -> list[dict]:
    """Dwa łany tej samej uprawy na jednej działce dają ten sam wynik analizy – łączymy je w jedną część."""
    grupy: dict[str, dict] = {}
    for p in pola:
        k = p["uprawa"] or f"?{p['roslina']}"
        g = grupy.get(k)
        if g is None:
            g = grupy[k] = {"uprawa": p["uprawa"], "geom": p["geom"], "rosliny": []}
        else:
            g["geom"] = g["geom"].union(p["geom"])
        if p["roslina"] and p["roslina"] not in g["rosliny"]:
            g["rosliny"].append(p["roslina"])
    for g in grupy.values():
        g["ha"] = _ha(g["geom"])
    return sorted(grupy.values(), key=lambda g: -g["ha"])


async def _z_arimr(client, rings, rok: int, dz, ha_dz: float) -> tuple[list[dict], Wynik]:
    w = await sources.arimr_pola(client, rings, rok)
    if not w.ok:
        return [], w
    pola = []
    for f in w.dane:
        cz, ha = przytnij(dz, f["rings"])
        if cz is None or _drobny(ha, ha_dz):
            continue
        pola.append({"uprawa": z_arimr(f["roslina"]), "roslina": f["roslina"], "geom": cz})
    return _scal_po_uprawie(pola), w


def _z_pikseli(px, E0: int, N0: int, klasy: dict):
    """Piksele CLMS (10 m, EPSG:3035) → geometria w EPSG:4326 dla każdej klasy uprawy."""
    from pyproj import Transformer
    from shapely.geometry import box
    from shapely.ops import transform, unary_union
    inv = Transformer.from_crs(3035, 4326, always_xy=True)
    kratki: dict[int, list] = {}
    for i, j, kod in px:
        x, y = E0 + j * 10, N0 + 2500 - (i + 1) * 10
        kratki.setdefault(kod, []).append(box(x, y, x + 10, y + 10))
    out = []
    for kod, b in kratki.items():
        nazwa, key = klasy.get(kod, klasy.get(str(kod), (str(kod), None)))
        if kod == 0:                      # jak w _clms_rok: poza gruntami ornymi, czyli użytek zielony
            nazwa, key = "użytek zielony / pastewne", "laka"
        out.append({"key": key, "nazwa": nazwa, "geom": transform(inv.transform, unary_union(b))})
    return out


async def _z_clms(client, rings, rok: int, dz, ha_dz: float) -> tuple[list[dict], Wynik]:
    w = await cdse.piksele_clms(client, rings, rok)
    if not w.ok:
        return [], w
    pola = []
    for f in _z_pikseli(w.dane["px"], w.dane["E0"], w.dane["N0"], w.dane["klasy"]):
        cz = dz.intersection(f["geom"])
        ha = _ha(cz)
        if not _polygony(cz) or _drobny(ha, ha_dz):
            continue
        pola.append({"uprawa": f["key"], "roslina": f["nazwa"], "geom": cz})
    return _scal_po_uprawie(pola), w


async def czesci_dzialki(client, rings, rok: int) -> Wynik:
    """Części uprawne działki na rok `rok`. Zawsze zwraca co najmniej jedną część (całą działkę)."""
    zr = "Podział działki na uprawy"
    dz = _geom(rings)
    if dz is None:
        return Wynik(zr, None, powod="nie udało się odczytać granic działki")
    ha_dz = _ha(dz)

    pola, w = await _z_arimr(client, rings, rok, dz, ha_dz)
    zrodlo_opis, zrodlo_brak = f"deklaracje ARiMR {rok}", f"poza deklaracjami ARiMR {rok}"
    if not pola:
        brak = w.powod or "brak deklaracji na działce"
        pola, w = await _z_clms(client, rings, rok, dz, ha_dz)
        zrodlo_opis, zrodlo_brak = f"mapa upraw Copernicus {rok}", f"nierozpoznane na mapie upraw Copernicus {rok}"
        if not pola:
            # Nic nie znaleziono – przyjmujemy „brak uprawy”, żeby rolnik mógł od razu iść dalej (może zmienić).
            return Wynik(zr, [_czesc(1, "brak", None, dz, ha_dz, ha_dz,
                                     f"nie znaleziono uprawy (ARiMR: {brak}; Copernicus: {w.powod or 'brak'}) "
                                     f"— przyjęto brak uprawy; możesz zmienić", pewne=False)],
                         url=w.url, czas_ms=w.czas_ms)

    return Wynik(zr, zloz(dz, pola, ha_dz, zrodlo_opis, zrodlo_brak), url=w.url, czas_ms=w.czas_ms, z_cache=w.z_cache)


def zloz(dz, pola: list[dict], ha_dz: float, zrodlo_opis: str, zrodlo_brak: str) -> list[dict]:
    """Rozłączne części pokrywające działkę: łany źródła plus reszta bez pokrycia."""
    # Deklaracje ARiMR potrafią na siebie zachodzić – większa część ma pierwszeństwo, żeby suma nie przekroczyła działki.
    out, pokryte = [], None
    for p in pola:
        g = p["geom"] if pokryte is None else p["geom"].difference(pokryte)
        ha = _ha(g)
        if not _polygony(g) or _drobny(ha, ha_dz):
            continue
        pokryte = g if pokryte is None else pokryte.union(g)
        nazwy = ", ".join(p["rosliny"]) or "?"
        out.append(_czesc(len(out) + 1, p["uprawa"], p["rosliny"][0] if p["rosliny"] else None, g,
                          ha, ha_dz, f"{zrodlo_opis}: {nazwy}", pewne=p["uprawa"] is not None))

    reszta = dz.difference(pokryte) if pokryte is not None else dz
    ha_r = _ha(reszta)
    if _polygony(reszta) and ha_dz and ha_r / ha_dz >= C.RESZTA_MIN_UDZIAL:
        # Źródło nic tu nie zna – domyślnie „brak uprawy” (jak przy działce bez danych); rolnik może zmienić.
        out.append(_czesc(len(out) + 1, "brak", None, reszta, ha_r, ha_dz,
                          f"{zrodlo_brak} — przyjęto brak uprawy; możesz zmienić", pewne=False))
    return out


# ---------------------------------------------------------------- wybór rolnika
def scal_wybor(czesci: list[dict], wybor: list[dict] | None, ha_dz: float) -> list[dict]:
    """Nakłada wybór rolnika na wykryty podział: uprawa i powierzchnia części, plus części dodane ręcznie.

    `wybor` = [{"id": "c1", "uprawa": "kukurydza", "ha": 2.4}, …]; pozycja bez `id` to nowa część
    (rolnik podaje uprawę i hektary, bez rysowania na mapie – liczy się wtedy na geometrii całej działki).
    """
    if not wybor:
        return czesci
    wg_id = {c["id"]: c for c in czesci}
    out, dodane = list(czesci), 0
    for poz in wybor:
        u = poz.get("uprawa")
        if u is not None and u not in UPRAWY:
            continue
        c = wg_id.get(str(poz.get("id") or ""))
        if c is not None:
            if u is not None and u != c["uprawa"]:
                c["uprawa"], c["nazwa"], c["pewne"] = u, UPRAWY[u].nazwa, True
                c["zrodlo"] = f"wskazane przez rolnika (źródło podawało: {c['roslina']})" if c["roslina"] \
                    else "wskazane przez rolnika"
            elif u is not None:
                c["pewne"] = True
            ha = poz.get("ha")
            if isinstance(ha, (int, float)) and 0 < ha <= ha_dz * 1.05:
                c["ha"], c["udzial"] = round(float(ha), 3), round(float(ha) / ha_dz, 4) if ha_dz else 0.0
        elif u is not None:
            dodane += 1
            ha = poz.get("ha")
            ha = float(ha) if isinstance(ha, (int, float)) and 0 < ha <= ha_dz * 1.05 else 0.0
            out.append(_czesc(len(czesci) + dodane, u, None, None, ha, ha_dz,
                              "dodane ręcznie przez rolnika", pewne=True, reczna=True))
    return [c for c in out if c["ha"] > 0 or not c["reczna"]]


def do_analizy(czesci: list[dict]) -> list[dict]:
    """Części z ustaloną uprawą – tylko one trafiają do warstwy uprawowej analizy."""
    return [c for c in czesci if c["uprawa"]]


def bez_uprawy(czesci: list[dict]) -> list[dict]:
    return [c for c in czesci if not c["uprawa"]]
