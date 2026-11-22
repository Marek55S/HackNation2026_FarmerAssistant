"""Przycięcia obrazów do slajdów (notebooks/fig + zrzuty aplikacji) → prezentacja/img/c_*.png"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FIG = ROOT / "notebooks" / "fig"
IMG = ROOT / "prezentacja" / "img"

CROPS = {
    # notebook: bez tytułów i pasków skali
    "c_uldk": (FIG / "a1_uldk.png", (20, 50, 532, 289)),
    "c_meteo": (FIG / "a2_meteo.png", (0, 44, 759, 449)),
    "c_iung": (FIG / "a4_iung.png", (20, 50, 532, 289)),
    "c_soil": (FIG / "a5_soilgrids.png", (74, 58, 598, 274)),
    "c_uprawy": (FIG / "a8_uprawy.png", (50, 58, 860, 297)),
    "c_dem": (FIG / "a9_dem.png", (82, 50, 502, 358)),
    "c_bdot": (FIG / "a10_bdot.png", (60, 60, 552, 416)),
    "c_ndmi": (FIG / "a11_ndmi.png", (25, 70, 445, 268)),
    "c_kbw": (FIG / "b2_kbw.png", (0, 44, 718, 449)),
    "c_bilans": (FIG / "b3_bilans.png", (0, 44, 859, 462)),
    "c_historia": (FIG / "b4_historia.png", (0, 44, 781, 449)),
    "c_ndmi_z": (FIG / "b8_ndmi_z.png", (25, 70, 425, 255)),
    "c_scen": (FIG / "b9_scenariusze.png", (0, 0, 1044, 497)),
    # aplikacja (zrzuty 2×)
    "c_landing": (IMG / "start_mapa_klik.png", (0, 0, 2880, 2380)),
    "c_pick_mapa": (IMG / "start_mapa_klik.png", (180, 1200, 1896, 2730)),
}

for name, (src, box) in CROPS.items():
    im = Image.open(src).convert("RGB")
    im.crop(box).save(IMG / f"{name}.png")
    print(name, im.size, "->", box)
