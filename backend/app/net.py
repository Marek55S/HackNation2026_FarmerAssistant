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


async def get(client: httpx.AsyncClient, zrodlo: str, url: str, params: dict | None = None, *,
              fmt: str = "json", timeout: float = 20.0, cache: bool = True, retries: int = 1) -> Wynik:
    """GET z cache. `fmt` = 'json' albo 'text'. Nigdy nie rzuca wyjątku."""
    path = _key(url, params)
    t0 = time.perf_counter()
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
            r = await client.get(url, params=params, timeout=timeout, headers=UA)
            if r.status_code != 200:
                last = f"HTTP {r.status_code}"
                continue
            dane = r.json() if fmt == "json" else r.text
            w = Wynik(zrodlo, dane, url=str(r.url).split("?")[0], czas_ms=int((time.perf_counter() - t0) * 1000))
            if cache:
                path.write_text(json.dumps({"dane": dane, "pobrano": w.pobrano}), encoding="utf-8")
            return w
        except httpx.TimeoutException:
            last = f"przekroczony czas odpowiedzi ({timeout:.0f} s)"
        except Exception as e:  # noqa: BLE001 – każdy błąd źródła = jawny brak
            last = f"{type(e).__name__}: {e}"[:200]
    return Wynik(zrodlo, None, powod=last, url=url, czas_ms=int((time.perf_counter() - t0) * 1000))
