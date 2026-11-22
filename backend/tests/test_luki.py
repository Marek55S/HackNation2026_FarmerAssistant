"""Testy zadań z TODO_LUKI.md (L1 satelita względem uprawy, L2 bilans z uprawą roku, L3 hydrologia, L4 efekt planu).
Bez sieci – dane syntetyczne i zapisane kształty odpowiedzi usług."""
from datetime import date, datetime, timedelta

import numpy as np

from app import hydro, satellite
from app.analysis import lata_tej_samej_uprawy, plan_efekt
from app.crops import UPRAWY, grupa
from app.facts import bilans
from app.net import Wynik, powod_bledu, powod_czytelny


# ---------------------------------------------------------------- L2
def test_bilans_z_uprawa_roku_zmienia_okno_i_pojemnosc():
    dni = [date(2019, 1, 1) + timedelta(days=i) for i in range(730)]
    P, E = np.zeros(730), np.full(730, 3.0)
    kuk, ziem = UPRAWY["kukurydza"], UPRAWY["ziemniak"]
    stala = bilans(P, E, dni, kuk, 150.0, 72)
    zmienna = bilans(P, E, dni, kuk, 150.0, 72, u_roku=lambda y: ziem if y == 2019 else kuk)
    i19 = [i for i, d in enumerate(dni) if d.year == 2019]
    # ziemniak ma płytsze korzenie (0,5 m) → mniejszy „zbiornik”: deficyt w 2019 nie przekracza 75 mm
    assert zmienna["Dr"][i19].max() <= 150.0 * 0.5 + 1e-6 < stala["Dr"][i19].max()
    # ziemniak rusza wcześniej (20.04) niż kukurydza (25.04) → stres ma inne dni w 2019
    assert not np.array_equal(zmienna["stres"][i19], stala["stres"][i19])
    # rok 2020 – ta sama uprawa w obu przebiegach, różnica tylko przez stan na 1 stycznia
    assert zmienna["Dr"][-1] > 0


def test_bilans_bez_u_roku_bez_zmian():
    dni = [date(2020, 7, 1) + timedelta(days=i) for i in range(40)]
    u = UPRAWY["kukurydza"]
    a = bilans(np.zeros(40), np.full(40, 5.0), dni, u, 150.0, 72)
    b = bilans(np.zeros(40), np.full(40, 5.0), dni, u, 150.0, 72, u_roku=lambda y: u)
    assert np.allclose(a["Dr"], b["Dr"]) and (a["stres"] == b["stres"]).all()


# ---------------------------------------------------------------- L1
def test_grupy_lanu():
    assert grupa(UPRAWY["pszenica"]) == grupa(UPRAWY["jare"]) == "zboża"
    assert grupa(UPRAWY["ziemniak"]) == grupa(UPRAWY["burak"]) == "okopowe"
    assert grupa(UPRAWY["inna"]) is None


def test_lata_odniesienia_tylko_ta_sama_grupa_i_rosliny_na_polu():
    hist = {2019: "pszenica", 2020: "rzepak", 2021: "jare", 2022: None, 2023: "kukurydza", 2024: "pszenica"}
    ur = lambda y: (UPRAWY[hist[y]] if hist.get(y) else None, "")
    lata = lata_tej_samej_uprawy(list(hist), UPRAWY["pszenica"], date(2026, 6, 10), ur)
    assert lata == {2019, 2021, 2024}                 # rzepak, kukurydza i rok nieznany odpadają
    # 15 sierpnia zboża jare są już po zbiorze (koniec ok. 30.07), ozime jeszcze nie (ok. 23.08) – rok 2021 odpada,
    # bo NDMI mierzy wtedy ściernisko; 10 września po zbiorze są wszystkie
    assert lata_tej_samej_uprawy(list(hist), UPRAWY["pszenica"], date(2026, 8, 15), ur) == {2019, 2024}
    assert lata_tej_samej_uprawy(list(hist), UPRAWY["pszenica"], date(2026, 9, 10), ur) == set()


def _scena(v: float, n: int = 4) -> dict:
    return {"ndmi": np.full((n, n), v), "czyste": np.ones((n, n), bool), "inside": np.ones((n, n), bool),
            "lon": np.tile(np.arange(n, dtype=float), (n, 1)), "lat": np.tile(np.arange(n, dtype=float)[:, None], (1, n))}


def test_anomalia_filtruje_lata_i_odmawia_przy_malej_probie():
    refs = [(2019, _scena(0.30)), (2020, _scena(0.10)), (2021, _scena(0.32)), (2023, _scena(0.12)), (2024, _scena(0.31))]
    w = satellite.surowe("test", _scena(0.20), refs, {"data": "2026-06-10"}, min_px=2, px_ha=0.04, url=None, czas_ms=0)
    assert w.ok
    zbo = satellite.anomalia(w, {2019, 2021, 2024})
    assert zbo.ok and zbo.dane["lata_ref"] == [2019, 2021, 2024] and zbo.dane["z_med"] < -1   # suszej niż zwykle zboża
    malo = satellite.anomalia(w, {2019, 2021})
    assert not malo.ok and "potrzeba co najmniej 3" in malo.powod
    powod = satellite.anomalia(w, set(), "mapa upraw nie odpowiedziała")
    assert not powod.ok and powod.powod == "mapa upraw nie odpowiedziała"


# ---------------------------------------------------------------- L3
def test_zlewnia_z_mphp():
    dane = {"type": "FeatureCollection", "features": [{"properties": {"gn_spelling": "Cisownik", "hy_localid": "2486821"},
            "geometry": {"type": "Polygon", "coordinates": [[[22.0, 51.8], [22.01, 51.8], [22.01, 51.81], [22.0, 51.81], [22.0, 51.8]]]}}]}
    z = hydro.zlewnia_z_json(dane)
    assert z["nazwa"] == "Cisownik" and z["id"] == "2486821" and 0.6 < z["pow_km2"] < 0.8
    assert hydro.zlewnia_z_json({"features": []}) is None


def test_powod_bledu_ukrywa_libexpat():
    e = ImportError("libexpat.so.1: cannot open shared object file")
    assert "aktualizacja obrazu" in powod_bledu(e)
    assert "libexpat.so" not in powod_bledu(e)
    assert "aktualizacja obrazu" in powod_czytelny("Sentinel Hub: ImportError: libexpat.so.1: cannot open")


def test_zlewnia_wybiera_najmniejsza_i_odrzuca_dorzecze():
    """WMS bywa zwracać Odra (~10⁵ km²) obok małej zlewni — bierzemy najmniejszą; same dorzecze = brak."""
    mala = {"properties": {"gn_spelling": "Cisownik", "hy_localid": "1"},
            "geometry": {"type": "Polygon", "coordinates": [[[22.0, 51.8], [22.01, 51.8], [22.01, 51.81], [22.0, 51.81], [22.0, 51.8]]]}}
    # ~1°×1° ≈ 7–8 tys. km² — powyżej limitu elementarnej
    duza = {"properties": {"gn_spelling": "Odra", "hy_localid": "odra"},
            "geometry": {"type": "Polygon", "coordinates": [[[14.0, 50.0], [23.0, 50.0], [23.0, 54.0], [14.0, 54.0], [14.0, 50.0]]]}}
    z = hydro.zlewnia_z_json({"features": [duza, mala]})
    assert z["nazwa"] == "Cisownik" and z["pow_km2"] < 1
    assert hydro.zlewnia_z_json({"features": [duza]}) is None
    powod = hydro.zlewnia_odrzucona_powod({"features": [duza]})
    assert powod and "Odra" in powod and "nie używamy" in powod


def test_wodowskaz_ta_sama_rzeka_i_promien():
    lista = [{"stacja": "A", "rzeka": "Wieprz", "lon": "22.20", "lat": "51.80", "stan_wody": "150"},
             {"stacja": "B", "rzeka": "Krzna", "lon": "22.11", "lat": "51.79", "stan_wody": None},
             {"stacja": "C", "rzeka": "Wisła", "lon": "21.00", "lat": "52.20", "stan_wody": "300"}]
    st = hydro.stacje_w_poblizu(lista, 22.10, 51.79)
    assert [s["stacja"] for s in st] == ["B", "A"]           # C ponad 30 km
    assert hydro.wybierz_stacje(st, "Wieprz")["stacja"] == "A"
    assert hydro.wybierz_stacje(st, None)["stacja"] == "B" and st[0]["stan_cm"] is None


def test_ostrzezenia_po_wojewodztwie_i_terminie():
    lista = [{"zdarzenie": "Susza hydrologiczna", "data_od": "2026-04-17 08:46:51", "data_do": "9999-12-31 23:59:59",
              "przebieg": "przepływy poniżej SNQ", "obszary": [{"wojewodztwo": "łódzkie", "opis": "Warta górna"}]},
             {"zdarzenie": "Wezbranie z przekroczeniem stanów ostrzegawczych", "data_od": "2026-04-17 08:00:00",
              "data_do": "9999-12-31 23:59:59", "obszary": [{"wojewodztwo": "łódzkie", "opis": "x"}]},
             {"zdarzenie": "Susza hydrologiczna", "data_od": "2025-01-01 00:00:00", "data_do": "2025-02-01 00:00:00",
              "obszary": [{"wojewodztwo": "łódzkie", "opis": "stare"}]}]
    teraz = datetime(2026, 11, 21, 12)
    o = hydro.ostrzezenia_dla(lista, "Łódzkie", teraz)
    assert len(o) == 1 and o[0]["opis"] == "Warta górna"
    assert hydro.ostrzezenia_dla(lista, "lubelskie", teraz) == []
    assert hydro.biezace(date(2026, 11, 20), date(2026, 11, 21)) and not hydro.biezace(date(2018, 7, 15), date(2026, 11, 21))


# ---------------------------------------------------------------- L4
def test_efekt_planu_mowi_wprost_gdy_ryzyko_zostaje():
    base = {"dostepny": True, "kolumny": ["kwi", "maj", "cze", "lip"], "ryzyko": [0, 2, 6, 10],
            "brak_med": 80.0, "brak_p80": 120.0, "dni_stresu_sr": 30.0}
    plan = dict(base, ryzyko=[0, 1, 5, 10], brak_med=70.0, dni_stresu_sr=27.5)
    t = plan_efekt(base, plan, UPRAWY["pszenica"], 10, {"R5", "R8"})
    assert "ryzyko w lipcu zostaje (10 z 10)" in t and "ok. 10 mm mniej" in t
    assert "poza oknem wrażliwym" in t and "nawadnianie" in t
    lepiej = plan_efekt(base, dict(plan, ryzyko=[0, 0, 2, 4]), UPRAWY["kukurydza"], 10, set())
    assert "Z planem: 4 z 10" in lepiej
    assert "nie zmieniają bilansu" in plan_efekt(base, base, UPRAWY["pszenica"], 10, set())
