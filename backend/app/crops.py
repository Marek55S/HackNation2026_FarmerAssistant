"""Tabela upraw (T4.4): Kc w fazach, p, głębokość korzeni (FAO‑56 tab. 12, 17, 22), kalendarz dla Polski,
okno wrażliwości i wiersz w tabeli progów IUNG. Wartości ⚙️ do konsultacji z dr. Gozdowskim (T0.6).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class Uprawa:
    key: str
    nazwa: str
    wiersz_iung: str | None      # wiersz w dane/kbw_progi_iung.csv; None = brak urzędowego progu
    start: tuple[int, int]       # siew / ruszenie wegetacji (miesiąc, dzień)
    fazy: tuple[int, int, int, int]   # długości faz: początkowa, rozwój, środkowa, końcowa (dni)
    kc: tuple[float, float, float]    # Kc ini, mid, end
    p: float                     # frakcja łatwo dostępnej wody (RAW = p·TAW)
    zr: float                    # głębokość korzeni (m)
    okno: tuple[tuple[int, int], tuple[int, int]]  # okno wrażliwości (od, do)
    okno_opis: str
    faza_krytyczna: str


UPRAWY: dict[str, Uprawa] = {u.key: u for u in [
    Uprawa("kukurydza", "Kukurydza", "Kukurydza na ziarno", (4, 25), (30, 40, 50, 40), (0.30, 1.20, 0.50), 0.55, 1.0,
           ((7, 1), (8, 31)), "lipiec–sierpień", "wiechowanie i kwitnienie"),
    Uprawa("pszenica", "Zboża ozime", "Zboża ozime", (3, 1), (35, 50, 60, 30), (0.40, 1.15, 0.30), 0.55, 1.0,
           ((4, 15), (6, 30)), "połowa kwietnia–czerwiec", "strzelanie w źdźbło i kwitnienie"),
    Uprawa("jare", "Zboża jare", "Zboża jare", (4, 1), (20, 30, 45, 25), (0.30, 1.15, 0.25), 0.55, 1.0,
           ((5, 15), (6, 30)), "połowa maja–czerwiec", "strzelanie w źdźbło i kłoszenie"),
    Uprawa("rzepak", "Rzepak", "Rzepak i rzepik", (3, 1), (30, 45, 50, 30), (0.35, 1.10, 0.35), 0.60, 1.0,
           ((4, 1), (5, 31)), "kwiecień–maj", "kwitnienie"),
    Uprawa("ziemniak", "Ziemniak", "Ziemniak", (4, 20), (25, 30, 45, 30), (0.50, 1.15, 0.75), 0.35, 0.5,
           ((6, 15), (8, 31)), "połowa czerwca–sierpień", "zawiązywanie bulw"),
    Uprawa("burak", "Burak cukrowy", "Burak cukrowy", (4, 10), (30, 45, 70, 50), (0.35, 1.20, 0.70), 0.55, 0.9,
           ((7, 1), (8, 31)), "lipiec–sierpień", "przyrost korzenia"),
    Uprawa("laka", "Łąka / pastwisko", None, (4, 1), (20, 30, 120, 30), (0.90, 0.95, 0.90), 0.60, 0.5,
           ((4, 15), (9, 15)), "cały sezon", "odrost po pokosie"),
    Uprawa("inna", "Inna uprawa", "Warzywa gruntowe", (5, 1), (25, 35, 50, 30), (0.60, 1.05, 0.90), 0.45, 0.6,
           ((6, 15), (8, 15)), "połowa czerwca–połowa sierpnia", "intensywny wzrost"),
]}


# Grupy łanu do porównań satelitarnych (L1, decyzja 21.11.2026; ⚙️ do potwierdzenia z dr. Gozdowskim):
# NDMI porównujemy tylko z latami, w których rosła roślina o podobnym łanie. „inna” nie ma grupy → brak porównania.
GRUPA: dict[str, str | None] = {"pszenica": "zboża", "jare": "zboża", "kukurydza": "kukurydza", "rzepak": "rzepak",
                                "ziemniak": "okopowe", "burak": "okopowe", "laka": "użytki zielone", "inna": None}


def grupa(u: "Uprawa | None") -> str | None:
    return GRUPA.get(u.key) if u else None


def kc_dnia(u: Uprawa, d: date, kc_poza: float) -> tuple[float, str]:
    """Kc i nazwa fazy w danym dniu (krzywa FAO‑56 z liniowym rozwojem i dojrzewaniem)."""
    s = date(d.year, *u.start)
    l1, l2, l3, l4 = u.fazy
    t = (d - s).days
    ini, mid, end = u.kc
    if t < 0 or t >= l1 + l2 + l3 + l4:
        return kc_poza, "poza wegetacją"
    if t < l1:
        return ini, "początkowa"
    if t < l1 + l2:
        return ini + (mid - ini) * (t - l1) / l2, "rozwój"
    if t < l1 + l2 + l3:
        return mid, "pełnia"
    return mid + (end - mid) * (t - l1 - l2 - l3) / l4, "dojrzewanie"


def w_oknie(u: Uprawa, d: date) -> bool:
    (m1, d1), (m2, d2) = u.okno
    return date(d.year, m1, d1) <= d <= date(d.year, m2, d2)


def koniec_wegetacji(u: Uprawa, rok: int) -> date:
    return date(rok, *u.start) + timedelta(days=sum(u.fazy))


def z_arimr(roslina: str) -> str | None:
    """Mapowanie nazwy rośliny z deklaracji ARiMR na klucz uprawy (A6 w TODO)."""
    r = (roslina or "").lower()
    if "kukurydz" in r:
        return "kukurydza"
    if "rzepak" in r or "rzepik" in r:
        return "rzepak"
    if "ziemniak" in r:
        return "ziemniak"
    if "burak" in r:
        return "burak"
    if any(x in r for x in ("łąk", "lak", "pastw", "trwał", "trawa", "tuz", "lucern", "koniczyn")):
        return "laka"
    if any(x in r for x in ("pszen", "żyto", "zyto", "jęczm", "jeczm", "owies", "pszenżyt", "mieszank")):
        return "pszenica" if ("ozim" in r or ("owies" not in r and "jar" not in r)) else "jare"
    return "inna" if r else None
