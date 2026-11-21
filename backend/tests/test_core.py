"""Testy jednostkowe rdzenia obliczeń (T12.1). Bez sieci – dane syntetyczne."""
from datetime import date, timedelta

import numpy as np

from app import geo
from app.crops import UPRAWY, kc_dnia, w_oknie, z_arimr
from app.facts import Meteo, Plan, bilans, horyzont, ocena_kbw_teraz, odplyw, prog_iung, s_cn, scenariusze, stopien


def meteo_stale(p: float, e: float, od=date(2000, 1, 1), do=date(2026, 11, 20)) -> Meteo:
    n = (do - od).days + 1
    dni = [od + timedelta(days=i) for i in range(n)]
    return Meteo.z_json({"time": [d.isoformat() for d in dni], "precipitation_sum": [p] * n,
                         "et0_fao_evapotranspiration": [e] * n, "temperature_2m_max": [20.0] * n})


def test_progi_z_csv():
    u = UPRAWY["kukurydza"]
    assert prog_iung(u, 2, 3) == -200.0          # Kukurydza na ziarno, kat. II, 21.04–20.06
    assert prog_iung(u, 2, 0) is None            # brak progu na początku sezonu dla kukurydzy
    assert prog_iung(UPRAWY["laka"], 2, 5) is None


def test_okres_kbw_i_susza():
    u = UPRAWY["kukurydza"]
    m = meteo_stale(0.0, 4.0)                    # 60 dni × −4 mm = −240 mm
    r = ocena_kbw_teraz(m, u, 2, date(2018, 7, 15))
    assert r["okres"].startswith("11.05–10.07")  # ostatni pełny okres kończący się ≤ 15.07
    assert r["kbw"] == -244.0                    # 61 dni w okresie 11.05–10.07
    assert r["prog"] == -188.0 and r["susza"]
    m2 = meteo_stale(3.0, 3.0)
    assert not ocena_kbw_teraz(m2, u, 2, date(2018, 7, 15))["susza"]


def test_stopien():
    assert stopien(-150, -188) == "brak"
    assert stopien(-200, -188) == "umiark."
    assert stopien(-260, -188) == "skrajna"


def test_scs_cn_lambda005():
    S = s_cn(72)
    assert odplyw(1.0, S) < odplyw(30.0, S)
    assert odplyw(0.5, S) == 0.0 or odplyw(0.5, S) < 0.01
    assert 0 < odplyw(40.0, S) < 40.0


def test_bilans_susza_i_deszcz():
    u = UPRAWY["kukurydza"]
    dni = [date(2020, 7, 1) + timedelta(days=i) for i in range(40)]
    sucho = bilans(np.zeros(40), np.full(40, 5.0), dni, u, 150.0, 72)
    assert sucho["stres"].any() and sucho["Dr"][-1] > sucho["RAW"]
    mokro = bilans(np.full(40, 8.0), np.full(40, 5.0), dni, u, 150.0, 72)
    assert not mokro["stres"].any()
    nawod = bilans(np.zeros(40), np.full(40, 5.0), dni, u, 150.0, 72, plan=Plan(nawadniaj=True, max_dawka=25))
    assert nawod["irr"].sum() > 0 and nawod["stres"].sum() < sucho["stres"].sum()


def test_mulcz_zmniejsza_parowanie_poza_wegetacja():
    u = UPRAWY["kukurydza"]
    dni = [date(2020, 10, 15) + timedelta(days=i) for i in range(60)]
    a = bilans(np.zeros(60), np.full(60, 2.0), dni, u, 150.0, 72)
    b = bilans(np.zeros(60), np.full(60, 2.0), dni, u, 150.0, 72, plan=Plan(mulcz=True))
    assert b["Dr"][-1] < a["Dr"][-1]


def test_kalendarz_uprawy():
    u = UPRAWY["kukurydza"]
    assert kc_dnia(u, date(2020, 7, 15), 0.3)[1] == "pełnia"
    assert kc_dnia(u, date(2020, 12, 1), 0.3) == (0.3, "poza wegetacją")
    assert w_oknie(u, date(2020, 7, 15)) and not w_oknie(u, date(2020, 5, 15))


def test_mapowanie_arimr():
    assert z_arimr("kukurydza na ziarno") == "kukurydza"
    assert z_arimr("pszenica ozima") == "pszenica"
    assert z_arimr("jęczmień jary") == "jare"
    assert z_arimr("owies zwyczajny") == "jare"
    assert z_arimr("lucerna mieszańcowa") == "laka"
    assert z_arimr("rzepak ozimy") == "rzepak"


def test_horyzont_i_scenariusze():
    _, cols, w_sez = horyzont(date(2026, 7, 15))
    assert w_sez and len(cols) == 6 and cols[0][0] == "do 22.07"
    _, cols2, w2 = horyzont(date(2026, 11, 21))
    assert not w2 and [c[0] for c in cols2] == ["kwi", "maj", "cze", "lip", "sie", "wrz"] and cols2[0][1].year == 2027
    m = meteo_stale(0.0, 4.0)
    s = scenariusze(m, UPRAWY["kukurydza"], 150.0, 72, date(2026, 7, 15), 60.0, None, 10)
    assert s["dostepny"] and s["N"] == 10 and s["f18_14"] == 1.0   # bez deszczu stres we wszystkich przebiegach


def test_geometria():
    sq = [[(17.0, 53.0), (17.01, 53.0), (17.01, 53.01), (17.0, 53.01)]]
    a = geo.area_m2(sq) / 10000
    assert 70 < a < 80                                  # ~0,01° × 0,01° na 53°N ≈ 74 ha
    assert geo.inside_any(geo.centroid(sq), sq)
    assert all(geo.inside_any(p, sq) for p in geo.grid_points(sq, 4))
