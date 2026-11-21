"""API prototypu (T1.1) + serwowanie frontendu.

Uruchomienie (z katalogu backend/):  python -m uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .analysis import analizuj, znajdz_dzialke
from .raport_front import do_raportu
from .crops import UPRAWY

# Statyczny podgląd HTML (opcjonalny): katalog z index.html wskazany przez AW_STATIC_DIR.
# Właściwy frontend to aplikacja Next.js w frontend/ (uruchamiana osobno).
import os
FRONT = Path(os.environ.get("AW_STATIC_DIR", Path(__file__).resolve().parents[2] / "frontend_html"))
ID_RE = re.compile(r"^[0-9A-Za-z_./-]{5,60}$")

app = FastAPI(title="Asystent Wodny – API", version="0.1")


class Zapytanie(BaseModel):
    id: str | None = Field(None, description="identyfikator działki EGiB, np. 041005_5.0008.57/11")
    lon: float | None = None
    lat: float | None = None
    data: date | None = None
    uprawa: str | None = None
    od: date | None = None


def _waliduj(q: Zapytanie) -> date:
    """Walidacja wejścia (T12.6): format ID, zakres współrzędnych (Polska), data z ostatnich 10 lat."""
    if q.id:
        if not ID_RE.match(q.id.strip()):
            raise HTTPException(422, "Nieprawidłowy identyfikator działki. Format: 141201_1.0001.123/4")
    elif q.lon is None or q.lat is None:
        raise HTTPException(422, "Podaj identyfikator działki albo punkt na mapie.")
    elif not (14.0 <= q.lon <= 24.2 and 49.0 <= q.lat <= 55.0):
        raise HTTPException(422, "Punkt poza Polską.")
    d = q.data or date.today()
    if d > date.today() or d < date.today() - timedelta(days=3653):
        raise HTTPException(422, "Data analizy musi być z ostatnich 10 lat i nie z przyszłości.")
    if q.uprawa and q.uprawa not in UPRAWY:
        raise HTTPException(422, "Nieznana uprawa.")
    return d


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/uprawy")
async def uprawy():
    return [{"key": u.key, "nazwa": u.nazwa, "prog_iung": bool(u.wiersz_iung), "okno": u.okno_opis} for u in UPRAWY.values()]


@app.get("/api/szukaj")
async def szukaj(obreb: str, numer: str, gmina: str | None = None):
    """T2.3: wyszukiwanie po gminie, obrębie i numerze."""
    if not (1 <= len(obreb) <= 60 and 1 <= len(numer) <= 20 and re.match(r"^[\w ./-]+$", obreb + numer)):
        raise HTTPException(422, "Podaj nazwę obrębu i numer działki.")
    import httpx
    from .sources import szukaj_obreb
    async with httpx.AsyncClient() as client:
        w = await szukaj_obreb(client, obreb, numer, gmina)
    return {"ok": w.ok, "wyniki": w.dane or [], "powod": w.powod}


@app.post("/api/dzialka")
async def dzialka(q: Zapytanie):
    d = _waliduj(q)
    return await znajdz_dzialke(q.id, q.lon, q.lat, d)


@app.post("/api/analiza")
async def analiza(q: Zapytanie):
    d = _waliduj(q)
    out = await analizuj(q.id, q.lon, q.lat, d, q.uprawa)
    out.pop("surowe", None)
    return out


@app.post("/api/raport")
async def raport(q: Zapytanie):
    """Raport w kształcie `Report` frontendu Next.js (frontend/src/lib/types.ts)."""
    d = _waliduj(q)
    out = await analizuj(q.id, q.lon, q.lat, d, q.uprawa)
    if not out.get("ok"):
        if out.get("potrzebna_uprawa"):
            return JSONResponse({"error": out["powod"], "potrzebna_uprawa": True}, status_code=422)
        status = 404 if "ewidencji" in (out.get("powod") or "") else 502
        return JSONResponse({"error": out.get("powod") or "Analiza nie powiodła się."}, status_code=status)
    od = q.od.isoformat() if q.od and q.od < d else None
    return {"report": do_raportu(out, date.today().isoformat(), od)}


if (FRONT / "index.html").exists():
    @app.get("/")
    async def index():
        return FileResponse(FRONT / "index.html")

    app.mount("/", StaticFiles(directory=FRONT, html=True), name="front")
