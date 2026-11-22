"""Wspólny klient HTTP: timeouty, 1 ponowienie, cache na dysku (T1.3) i zapis czasu pobrania.

Każde pobranie zwraca `Wynik` – albo dane, albo jawny brak z powodem (T1.4). Wyjątki nie wychodzą dalej.
"""
from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"
CACHE_DIR.mkdir(exist_ok=True)
UA = {"User-Agent": "AsystentWodny/0.1 (prototyp HackNation)"}


def limit(s: float) -> httpx.Timeout:
    """`s` sekund na odpowiedź, ale tylko TIMEOUT_POLACZENIA_S na nawiązanie połączenia: usługa, która nie odpowiada
    wcale, odpada po kilku sekundach zamiast po pełnym czasie."""
    from .config import TIMEOUT_POLACZENIA_S
    return httpx.Timeout(s, connect=min(s, TIMEOUT_POLACZENIA_S))


@dataclass
class Wynik:
    zrodlo: str
    dane: Any = None
    powod: str | None = None          # gdy brak danych – dlaczego
    url: str | None = None
    czas_ms: int = 0
    z_cache: bool = False
    pobrano: str = field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"))

    @property
    def ok(self) -> bool:
        return self.powod is None and self.dane is not None

    def opis(self) -> dict:
        return {"zrodlo": self.zrodlo, "ok": self.ok, "powod": self.powod, "czas_ms": self.czas_ms,
                "z_cache": self.z_cache, "pobrano": self.pobrano, "url": self.url}


def _key(url: str, params: dict | None) -> Path:
    raw = url + "?" + json.dumps(params or {}, sort_keys=True)
    return CACHE_DIR / (hashlib.sha1(raw.encode()).hexdigest() + ".json")


def powod_bledu(e: BaseException, limit: int = 200) -> str:
    """Powód braku do raportu: bez surowych ścieżek bibliotek systemowych."""
    raw = f"{type(e).__name__}: {e}"
    low = raw.lower()
    if "libexpat" in low or ("importerror" in low and "expat" in low):
        return "brak biblioteki systemowej do odczytu rastra (libexpat) — wymagana aktualizacja obrazu serwera"
    if isinstance(e, ImportError) and ("gdal" in low or "rasterio" in low):
        return "brak biblioteki do odczytu rastra na serwerze — wymagana aktualizacja obrazu"
    return raw[:limit]


def powod_czytelny(powod: str | None) -> str:
    """Ujednolicenie już zapisanego powodu (np. z kilku fallbacków satelity)."""
    if not powod:
        return "nieznany powód"
    low = powod.lower()
    if "libexpat" in low or ("importerror" in low and "expat" in low):
        return "brak biblioteki systemowej do odczytu rastra (libexpat) — wymagana aktualizacja obrazu serwera"
    return powod


def cache_czytaj(nazwa: str, klucz) -> object | None:
    """Wynik przetworzony wcześniej (np. uprawy CLMS działki) – dane, które się nie zmieniają."""
    f = _key(nazwa, {"k": klucz})
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
    except (OSError, ValueError):
        return None


def cache_zapisz(nazwa: str, klucz, dane) -> None:
    try:
        _key(nazwa, {"k": klucz}).write_text(json.dumps(dane, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    except OSError:
        pass


async def get(client: httpx.AsyncClient, zrodlo: str, url: str, params: dict | None = None, *,
              fmt: str = "json", timeout: float = 20.0, cache: bool = True, retries: int = 1,
              ttl_s: float | None = None) -> Wynik:
    """GET z cache. `fmt` = 'json' albo 'text'. `ttl_s` – ważność cache dla danych bieżących (np. stany rzek);
    bez niego cache nie wygasa (dane archiwalne). Nigdy nie rzuca wyjątku."""
    path = _key(url, params)
    t0 = time.perf_counter()
    if cache and path.exists() and ttl_s is not None and time.time() - path.stat().st_mtime > ttl_s:
        path.unlink(missing_ok=True)
    if cache and path.exists():
        try:
            stored = json.loads(path.read_text(encoding="utf-8"))
            return Wynik(zrodlo, stored["dane"], url=url, czas_ms=int((time.perf_counter() - t0) * 1000),
                         z_cache=True, pobrano=stored["pobrano"])
        except Exception:
            path.unlink(missing_ok=True)
    last = "nieznany błąd"
    for _ in range(retries + 1):
        try:
            r = await client.get(url, params=params, timeout=limit(timeout), headers=UA)
            if r.status_code == 429:
                # limit zapytań: natychmiastowe ponowienie tylko zużywa limit dalej
                last = "HTTP 429 — wyczerpany limit zapytań źródła, spróbuj za kilka minut"
                break
            if r.status_code != 200:
                last = f"HTTP {r.status_code}"
                continue
            dane = r.json() if fmt == "json" else r.text
            w = Wynik(zrodlo, dane, url=str(r.url).split("?")[0], czas_ms=int((time.perf_counter() - t0) * 1000))
            if cache:
                path.write_text(json.dumps({"dane": dane, "pobrano": w.pobrano}), encoding="utf-8")
            return w
        except httpx.ConnectTimeout:
            # usługa w ogóle nie odpowiada: ponowienie tylko podwoiłoby czekanie
            from .config import TIMEOUT_POLACZENIA_S
            last = f"usługa nie odpowiada (brak połączenia w {TIMEOUT_POLACZENIA_S:.0f} s)"
            break
        except httpx.TimeoutException:
            last = f"przekroczony czas odpowiedzi ({timeout:.0f} s)"
        except Exception as e:  # noqa: BLE001 – każdy błąd źródła = jawny brak
            last = f"{type(e).__name__}: {e}"[:200]
    return Wynik(zrodlo, None, powod=last, url=url, czas_ms=int((time.perf_counter() - t0) * 1000))
