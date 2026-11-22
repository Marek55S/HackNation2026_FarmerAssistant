"""Przycięcia obrazów do slajdów → prezentacja/img/c_*.png

Slajd 3 (API): wyłącznie figury z notebooks/fig — bez zrzutów aplikacji (m_*),
żeby deploy/demo na slajdach 4–5 zostało świeże.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FIG = ROOT / "notebooks" / "fig"
IMG = ROOT / "prezentacja" / "img"

CROPS = {
    # notebook – warstwy API (slajd 3)
    "c_uldk": (FIG / "a1_uldk.png", (20, 45, 530, 280)),
    "c_meteo": (FIG / "a2_meteo.png", (40, 40, 740, 430)),
    "c_iung": (FIG / "a4_iung.png", (20, 45, 530, 280)),
    "c_soil": (FIG / "a5_soilgrids.png", (40, 40, 640, 280)),
    "c_uprawy": (FIG / "a8_uprawy.png", (40, 45, 880, 290)),
    "c_dem": (FIG / "a9_dem.png", (70, 45, 530, 350)),
    "c_bdot": (FIG / "a10_bdot.png", (40, 50, 520, 380)),
    "c_ndmi": (FIG / "a11_ndmi.png", (20, 55, 520, 300)),
    "c_spadek": (FIG / "b7_teren.png", (8, 38, 490, 360)),
    "c_norma": (FIG / "b5_norma.png", (20, 36, 640, 430)),
    # metoda / model
    "c_kbw": (FIG / "b2_kbw.png", (30, 40, 700, 440)),
    "c_bilans": (FIG / "b3_bilans.png", (30, 40, 840, 450)),
    "c_historia": (FIG / "b4_historia.png", (20, 36, 760, 430)),
    "c_ndmi_z": (FIG / "b8_ndmi_z.png", (8, 28, 500, 310)),
    "c_ryzyko": (FIG / "b9_ryzyko.png", (20, 36, 700, 440)),
    "c_przyczyny": (FIG / "b10_przyczyny.png", (8, 40, 620, 360)),
    "c_scen": (FIG / "b9_scenariusze.png", (0, 0, 1044, 497)),
    # aplikacja – tylko landing / pick (nie heatmapy raportu)
    "c_landing": (IMG / "start_mapa_klik.png", (0, 0, 2880, 2380)),
    "c_pick_mapa": (IMG / "start_mapa_klik.png", (180, 1200, 1896, 2730)),
}

for name, (src, box) in CROPS.items():
    im = Image.open(src).convert("RGB")
    im.crop(box).save(IMG / f"{name}.png")
    print(name, im.size, "->", box)
