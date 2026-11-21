"""Fakty o działce (etap 3 i 3b pipeline'u): KBW + progi IUNG, bilans wody FAO‑56, historia 10 sezonów, scenariusze."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Callable

import numpy as np

from . import config as C
from .crops import Uprawa, kc_dnia, w_oknie
from .sources import OKRESY, progi

KAT_RZYM = {1: "I", 2: "II", 3: "III", 4: "IV", 5: "IV"}
MIES = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"]


def _shift(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:            # 29 lutego
        return d.replace(year=d.year + years, day=28)


@dataclass
class Meteo:
    dni: list[date]
    P: np.ndarray
    ET0: np.ndarray
    TMAX: np.ndarray
    idx: dict = field(default_factory=dict)

    @classmethod
    def z_json(cls, daily: dict) -> "Meteo":
        dni = [date.fromisoformat(t) for t in daily["time"]]
        f = lambda k: np.array([0.0 if v is None else v for v in daily.get(k, [])], dtype=float)
        m = cls(dni, f("precipitation_sum"), f("et0_fao_evapotranspiration"), f("temperature_2m_max"))
        m.idx = {d: i for i, d in enumerate(dni)}
        return m

    def suma(self, arr, d0: date, d1: date) -> float | None:
        if d0 not in self.idx or d1 not in self.idx:
            return None
        return float(arr[self.idx[d0]: self.idx[d1] + 1].sum())

    def kbw(self, d0: date, d1: date) -> float | None:
        p, e = self.suma(self.P, d0, d1), self.suma(self.ET0, d0, d1)
        return None if p is None or e is None else p - e


# ---------------- KBW i progi IUNG (F1–F3, F5) ----------------
def prog_iung(u: Uprawa, kat: int, i_okres: int) -> float | None:
    if not u.wiersz_iung:
        return None
    row = progi().get((u.wiersz_iung, KAT_RZYM.get(kat, "II")))
    return None if row is None else row[i_okres]


def okresy_roku(rok: int):
    progi()
    return [(i, lab, date(rok, *s), date(rok, *e)) for i, (lab, s, e) in enumerate(OKRESY)]


def stopien(kbw: float, prog: float) -> str:
    if kbw >= prog:
        return "brak"
    r = kbw / prog
    return next(t for lim, t in C.STOPNIE if r >= lim)


def ocena_kbw_teraz(m: Meteo, u: Uprawa, kat: int, D: date) -> dict:
    """F1–F3: ostatni pełny okres 6‑dekadowy kończący się ≤ D (w sezonie 21.III–30.IX)."""
    ok = [o for o in okresy_roku(D.year) if o[3] <= D and prog_iung(u, kat, o[0]) is not None]
    if not ok:
        first = [o for o in okresy_roku(D.year) if prog_iung(u, kat, o[0]) is not None]
        if not first or D < first[0][2]:
            return {"dostepny": False, "powod": "przed pierwszym okresem z progiem IUNG dla tej uprawy"}
        i, lab, s, _ = first[0]
        k = m.kbw(s, D)
        return {"dostepny": k is not None, "niepelny": True, "okres": f"{s:%d.%m}–{D:%d.%m}", "kbw": k,
                "prog": prog_iung(u, kat, i), "susza": k is not None and k < prog_iung(u, kat, i),
                "P": m.suma(m.P, s, D), "ET0": m.suma(m.ET0, s, D)}
    i, lab, s, e = ok[-1]
    k, p = m.kbw(s, e), prog_iung(u, kat, i)
    return {"dostepny": k is not None, "niepelny": False, "okres": f"{s:%d.%m}–{e:%d.%m.%Y}", "kbw": k, "prog": p,
            "susza": k is not None and k < p, "P": m.suma(m.P, s, e), "ET0": m.suma(m.ET0, s, e)}


def sezon_kbw(m: Meteo, u: Uprawa, kat: int, rok: int, do: date | None = None) -> dict:
    """Ocena jednego sezonu: najgorszy okres względem progu, miesiące z przekroczeniem."""
    worst, mies, przekr = None, set(), 0
    for i, lab, s, e in okresy_roku(rok):
        p = prog_iung(u, kat, i)
        if p is None or (do and e > do):
            continue
        k = m.kbw(s, e)
        if k is None:
            continue
        if worst is None or k / p > worst[0] / worst[1]:
            worst = (k, p, f"{s:%d.%m}–{e:%d.%m}")
        if k < p:
            przekr += 1
            mies.add((s + (e - s) / 2).month)
    if worst is None:
        return {"rok": rok, "dostepny": False}
    return {"rok": rok, "dostepny": True, "kbw": round(worst[0]), "prog": worst[1], "okres": worst[2],
            "stopien": stopien(worst[0], worst[1]), "przekroczen": przekr, "miesiace": sorted(mies)}


# ---------------- Bilans wody FAO‑56 (F4, F17–F21) ----------------
def s_cn(cn: float) -> float:
    """Retencja S (mm) dla λ = 0,05 przeliczona z CN dla λ = 0,2 (Hawkins i in.; S w calach)."""
    s20_in = (25400 / cn - 254) / 25.4
    return 1.33 * s20_in ** 1.15 * 25.4


def odplyw(P: float, S: float, lam: float = C.LAMBDA_CN) -> float:
    ia = lam * S
    return 0.0 if P <= ia else (P - ia) ** 2 / (P + (1 - lam) * S)


@dataclass
class Plan:
    mulcz: bool = False
    cn_minus: float = 0.0
    nawadniaj: bool = False          # R8: dawka przy przekroczeniu RAW w oknie wrażliwym
    dawka_teraz: float = 0.0         # R7: dawka w pierwszym dniu
    max_dawka: float = 25.0


def bilans(P, ET0, dni: list[date], u: Uprawa, TAW: float, cn: float, Dr0: float = 0.0, plan: Plan | None = None,
           u_roku: Callable[[int], Uprawa] | None = None):
    """Dzienny bilans strefy korzeniowej (FAO‑56 rozdz. 8). Zwraca Dr, stres (bool), niedobór ETc−ETa, nawodnienia.

    `u_roku(rok)` – uprawa, która rosła w danym roku (historia z ARiMR / mapy upraw). Wtedy Kc, okno wrażliwe, p i głębokość
    korzeni zmieniają się 1 stycznia; `TAW` dotyczy uprawy `u` i jest skalowane głębokością korzeni uprawy danego roku.
    Bez `u_roku` cały okres liczony jest dla `u` (scenariusze: przyszły sezon z uprawą wybraną przez rolnika)."""
    plan = plan or Plan()
    S = s_cn(max(30.0, cn - plan.cn_minus))
    taw_m = TAW / min(u.zr, 1.0)                 # woda dostępna na 1 m profilu (z kategorii gleby)
    uu, taw, rok = u, TAW, None
    RAW = u.p * TAW
    n = len(dni)
    Dr = np.zeros(n)
    stres = np.zeros(n, dtype=bool)
    brak = np.zeros(n)
    irr = np.zeros(n)
    d_r = Dr0
    ost_irr = -99
    for t in range(n):
        if u_roku is not None and dni[t].year != rok:
            rok = dni[t].year
            uu = u_roku(rok) or u
            taw = taw_m * min(uu.zr, 1.0)
            RAW = uu.p * taw
            d_r = min(d_r, taw)                  # inna głębokość korzeni = inna pojemność „zbiornika”
        p = float(P[t])
        q = odplyw(p, S)
        I = 0.0
        if t == 0 and plan.dawka_teraz:
            I = plan.dawka_teraz
        kc, faza = kc_dnia(uu, dni[t], C.KC_POZA)
        weget = faza != "poza wegetacją"
        if plan.nawadniaj and weget and w_oknie(uu, dni[t]) and d_r > RAW and t - ost_irr >= 5:
            I = min(d_r, plan.max_dawka)
            ost_irr = t
        d_r = max(0.0, d_r - (p - q) - I)
        ks = 1.0 if d_r <= RAW else max(0.0, (taw - d_r) / ((1 - uu.p) * taw))
        et = ks * kc * float(ET0[t])
        if plan.mulcz and kc < C.MULCZ_KC_GRANICA:
            et *= 1 - C.MULCZ_REDUKCJA_E
        d_r = min(taw, d_r + et)
        Dr[t] = d_r
        stres[t] = weget and ks < 1.0
        brak[t] = kc * float(ET0[t]) - et if weget else 0.0
        irr[t] = I
    return {"Dr": Dr, "stres": stres, "brak": brak, "irr": irr, "RAW": RAW}


# ---------------- Scenariusze (ESP, etap 3b) ----------------
def horyzont(D: date) -> tuple[date, list[tuple[str, date, date]], bool]:
    """Koniec horyzontu i kolumny tabeli ryzyka. W sezonie: 6 tygodni; poza sezonem: IV–IX kolejnego sezonu."""
    w_sez = date(D.year, 3, 21) <= D <= date(D.year, 9, 30)
    if w_sez:
        cols = []
        for k in range(6):
            a, b = D + timedelta(days=1 + 7 * k), D + timedelta(days=7 * (k + 1))
            cols.append((f"do {b:%d.%m}", a, b))
        return cols[-1][2], cols, True
    rok = D.year + 1 if D.month >= 10 else D.year
    cols = []
    for mth in range(4, 10):
        a = date(rok, mth, 1)
        b = (date(rok, mth + 1, 1) - timedelta(days=1))
        cols.append((MIES[mth - 1], a, b))
    return date(rok, 9, 30), cols, False


def scenariusze(m: Meteo, u: Uprawa, TAW: float, cn: float, D: date, Dr0: float, plan: Plan | None,
                N: int, prognoza: dict | None = None) -> dict:
    koniec, cols, w_sez = horyzont(D)
    dni = [D + timedelta(days=k) for k in range(1, (koniec - D).days + 1)]
    runs = []
    for k in range(1, N + 1):
        src = [_shift(d, -k) for d in dni]
        if any(s not in m.idx for s in src):
            continue
        P = np.array([m.P[m.idx[s]] for s in src])
        E = np.array([m.ET0[m.idx[s]] for s in src])
        if prognoza:          # pierwsze dni z prognozy (D = dziś)
            for j, d in enumerate(dni):
                if d.isoformat() in prognoza:
                    P[j], E[j] = prognoza[d.isoformat()]
        r = bilans(P, E, dni, u, TAW, cn, Dr0, plan)
        r["rok"] = D.year - k
        runs.append(r)
    if not runs:
        return {"dostepny": False}
    n = len(runs)
    ryzyko = []
    for lab, a, b in cols:
        ia, ib = (a - dni[0]).days, (b - dni[0]).days
        ryzyko.append(sum(1 for r in runs if r["stres"][ia: ib + 1].any()))
    # F18d – mediana dnia pierwszego stresu (w przebiegach, gdzie wystąpił)
    pierwsze = [int(np.argmax(r["stres"])) + 1 for r in runs if r["stres"].any()]
    okno = np.array([w_oknie(u, d) for d in dni])
    braki = [float(r["brak"][okno].sum()) for r in runs]
    dni_stresu = [int(r["stres"].sum()) for r in runs]
    return {"dostepny": True, "N": n, "kolumny": [c[0] for c in cols], "ryzyko": ryzyko, "w_sezonie": w_sez,
            "f18_14": sum(1 for r in runs if r["stres"][:14].any()) / n,
            "f18_max": max(ryzyko) / n, "f18d": float(np.median(pierwsze)) if pierwsze else None,
            "brak_med": float(np.median(braki)), "brak_p80": float(np.percentile(braki, 80)),
            "dni_stresu_sr": float(np.mean(dni_stresu)), "lata": [r["rok"] for r in runs],
            "irr_sr": float(np.mean([r["irr"].sum() for r in runs]))}
