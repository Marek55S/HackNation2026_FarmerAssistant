"""Podział działki ewidencyjnej na części uprawne (app/czesci.py). Bez sieci – geometria syntetyczna."""
from app import czesci
from app.cdse import KLASY


# Prostokąt ok. 400 × 445 m (≈ 17,8 ha) pod Szubinem; na tej szerokości 0,001° ≈ 67 m (lon) i 111 m (lat).
DZIALKA = [[(17.750, 53.050), (17.756, 53.050), (17.756, 53.054), (17.750, 53.054), (17.750, 53.050)]]


def _pola(*polys):
    """Łany źródła po scaleniu – tak jak dostaje je `zloz` z _z_arimr / _z_clms."""
    return czesci._scal_po_uprawie(
        [{"uprawa": u, "roslina": r, "geom": czesci._geom([ring])} for u, r, ring in polys])


def test_przyciecie_deklaracji_do_granic_dzialki():
    """Deklaracja ARiMR bywa większa od działki (jedno pole na kilku działkach) – liczy się część wspólna."""
    dz = czesci._geom(DZIALKA)
    duze = [(17.740, 53.050), (17.753, 53.050), (17.753, 53.054), (17.740, 53.054), (17.740, 53.050)]
    g, ha = czesci.przytnij(dz, [duze])
    assert g is not None
    assert ha < czesci._ha(dz)
    assert abs(ha / czesci._ha(dz) - 0.5) < 0.01      # deklaracja zachodzi na połowę działki


def test_czesci_sa_rozlaczne_mimo_nachodzacych_deklaracji():
    """Dwie deklaracje na siebie zachodzą – suma części nie może przekroczyć powierzchni działki."""
    dz = czesci._geom(DZIALKA)
    ha_dz = czesci._ha(dz)
    lewa = [(17.750, 53.050), (17.754, 53.050), (17.754, 53.054), (17.750, 53.054), (17.750, 53.050)]
    prawa = [(17.753, 53.050), (17.756, 53.050), (17.756, 53.054), (17.753, 53.054), (17.753, 53.050)]
    out = czesci.zloz(dz, _pola(("pszenica", "żyto ozime", lewa), ("kukurydza", "kukurydza", prawa)),
                      ha_dz, "deklaracje ARiMR 2025", "poza deklaracjami ARiMR 2025")
    assert [c["uprawa"] for c in out] == ["pszenica", "kukurydza"]
    assert sum(c["ha"] for c in out) <= ha_dz + 1e-6


def test_reszta_dzialki_z_otworem_nie_zawyza_powierzchni():
    """Deklaracja w środku działki zostawia resztę w kształcie pierścienia – otwór trzeba odjąć."""
    dz = czesci._geom(DZIALKA)
    ha_dz = czesci._ha(dz)
    srodek = [(17.752, 53.051), (17.754, 53.051), (17.754, 53.053), (17.752, 53.053), (17.752, 53.051)]
    out = czesci.zloz(dz, _pola(("kukurydza", "kukurydza na ziarno", srodek)),
                      ha_dz, "deklaracje ARiMR 2025", "poza deklaracjami ARiMR 2025")
    assert len(out) == 2 and out[1]["uprawa"] == "brak"
    assert out[1]["geometria"]["coordinates"][0][1:], "reszta musi zachować otwór po deklaracji"
    assert abs(sum(c["ha"] for c in out) - ha_dz) < 0.01


def test_laty_tej_samej_uprawy_sa_jedna_czescia():
    """Dwa osobne łany tej samej uprawy dają ten sam wynik analizy – nie dzielimy ich na dwie sekcje."""
    dz = czesci._geom(DZIALKA)
    a = [(17.750, 53.050), (17.752, 53.050), (17.752, 53.054), (17.750, 53.054), (17.750, 53.050)]
    b = [(17.754, 53.050), (17.756, 53.050), (17.756, 53.054), (17.754, 53.054), (17.754, 53.050)]
    out = czesci.zloz(dz, _pola(("kukurydza", "kukurydza na ziarno", a), ("kukurydza", "kukurydza kiszonkowa", b)),
                      czesci._ha(dz), "deklaracje ARiMR 2025", "poza deklaracjami ARiMR 2025")
    kukurydza = [c for c in out if c["uprawa"] == "kukurydza"]
    assert len(kukurydza) == 1
    assert len(kukurydza[0]["geometria"]["coordinates"]) == 2      # jedna część, dwa rozłączne łany


def test_skrawek_ponizej_progu_trafia_do_reszty():
    dz = czesci._geom(DZIALKA)
    skrawek = [(17.750, 53.050), (17.7502, 53.050), (17.7502, 53.0501), (17.750, 53.0501), (17.750, 53.050)]
    out = czesci.zloz(dz, _pola(("burak", "burak cukrowy", skrawek)), czesci._ha(dz), "ARiMR", "poza ARiMR")
    assert [c["uprawa"] for c in out] == ["brak"]


def test_wybor_rolnika_nadpisuje_uprawe_i_dodaje_czesc():
    dz = czesci._geom(DZIALKA)
    ha_dz = czesci._ha(dz)
    srodek = [(17.752, 53.051), (17.754, 53.051), (17.754, 53.053), (17.752, 53.053), (17.752, 53.051)]
    out = czesci.zloz(dz, _pola(("kukurydza", "kukurydza na ziarno", srodek)), ha_dz, "ARiMR", "poza ARiMR")
    scalone = czesci.scal_wybor(out, [{"id": "c2", "uprawa": "ziemniak"}, {"uprawa": "rzepak", "ha": 0.5}], ha_dz)
    wg_id = {c["id"]: c for c in scalone}
    assert wg_id["c2"]["uprawa"] == "ziemniak" and wg_id["c2"]["pewne"]
    reczna = [c for c in scalone if c["reczna"]]
    assert len(reczna) == 1 and reczna[0]["uprawa"] == "rzepak" and reczna[0]["ha"] == 0.5
    assert len(czesci.do_analizy(scalone)) == 3 and czesci.bez_uprawy(scalone) == []


def test_wybor_odrzuca_nieznana_uprawe_i_bzdurna_powierzchnie():
    dz = czesci._geom(DZIALKA)
    ha_dz = czesci._ha(dz)
    out = czesci.zloz(dz, [], ha_dz, "ARiMR", "poza ARiMR")
    scalone = czesci.scal_wybor(out, [{"id": "c1", "uprawa": "marchew"}, {"id": "c1", "ha": 9999}], ha_dz)
    assert scalone[0]["uprawa"] == "brak"  # nieznana uprawa rolnika nie nadpisuje domyślnego „brak”
    assert scalone[0]["ha"] == out[0]["ha"]


def test_piksele_clms_daja_wielokaty_a_kod_zero_to_uzytek_zielony():
    """Mapa Copernicus dzieli działkę w latach bez deklaracji ARiMR; kod 0 traktujemy jak _clms_rok."""
    px = [(0, 0, 1130), (0, 1, 1130), (1, 0, 1130), (5, 5, 0)]
    pola = czesci._z_pikseli(px, 4_000_000, 3_000_000, KLASY)
    wg_key = {p["key"]: p for p in pola}
    assert wg_key["kukurydza"]["geom"].area > wg_key["laka"]["geom"].area
    assert wg_key["laka"]["nazwa"] == "użytek zielony / pastewne"
