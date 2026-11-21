# Asystent Wodny – HackNation 2026 (KOWR „Zatrzymaj wodę, chroń plony”)
<!-- repozytorium: HackNation2026_FarmerAssistant -->

Aplikacja webowa: rolnik wskazuje dzień i działkę ewidencyjną, a narzędzie liczy sytuację wodną działki z danych
publicznych (bieżących i z 10 lat) i daje zalecenia w kolejności KOWR: **zatrzymaj wodę → na polu → nawadnianie**.

> Stan: prototyp. Backend (`backend/`, FastAPI) liczy analizę z danych publicznych; frontend PWA (`frontend/`, Next.js)
> pobiera z niego działki i raporty dla dowolnej działki w Polsce (bez danych przykładowych).
> Postęp prac: [TODO.md](TODO.md) (`[x]` zrobione, `[~]` częściowo).

## Uruchomienie

### Backend (API analizy)

Wymagania: Python 3.10+.

```bash
cd backend
pip install -r requirements.txt
# opcjonalnie: backend/.env z CDSE_CLIENT_ID i CDSE_CLIENT_SECRET (Sentinel Hub) – bez nich satelita idzie z Planetary Computer
python -m uvicorn app.main:app --port 8000
```

Po zmianie kodu backendu zrestartuj serwer (Ctrl+C i ponownie): na Windowsie `--reload` wykrywa zmiany,
ale potrafi zostawić stary proces, który dalej odpowiada.

Dokumentacja API: http://localhost:8000/docs. Testy: `cd backend && python -m pytest -q`.

Przykład: `POST /api/analiza` z `{"id": "041005_5.0008.57/11", "data": "2018-07-15", "uprawa": "kukurydza"}`
(działka w gm. Szubin, susza 2018).

### Frontend (PWA)

Next.js + TypeScript w katalogu [`frontend/`](frontend/README.md). Wymaga działającego backendu
(zmienna `BACKEND_URL`, domyślnie `http://127.0.0.1:8000`):

```bash
cd frontend
corepack pnpm install
corepack pnpm dev        # http://localhost:3000
```

Trasy API frontu przekazują zapytania do backendu: `/api/parcel` → `/api/dzialka` i `/api/szukaj`,
`/api/analyze` i strona `/raport` → `/api/raport` (raport w kształcie `Report` z `frontend/src/lib/types.ts`),
`/api/pola` → pola uprawne ARiMR w widoku mapy (pośrednik, bo serwer ARiMR odrzuca zapytania z przeglądarki).

### W Dockerze

Backend i frontend mają własne `compose.yaml`; uruchom każdy w osobnym terminalu (frontend łączy się z backendem
na porcie 8000 hosta):

```bash
cd backend && docker compose up dev     # http://localhost:8000
cd frontend && docker compose up dev    # http://localhost:3000
```

## Wdrożenie (Google Cloud Run)

Działa na projekcie `asystent-wodny-hn26`, region `europe-central2` (Warszawa):

- aplikacja: https://asystent-wodny-888051665742.europe-central2.run.app
- backend (publiczny, docs pod `/docs`): https://asystent-backend-888051665742.europe-central2.run.app

Nowa wersja – ręcznie, z zacommitowanego kodu (wymaga `docker` i zalogowanego `gcloud`):

```bash
./deploy.sh              # backend + frontend
./deploy.sh backend      # albo tylko jeden serwis
./deploy.sh frontend
```

Skrypt buduje obrazy lokalnie (tag = skrót commita), wysyła je do Artifact Registry
(`europe-central2-docker.pkg.dev/asystent-wodny-hn26/asystent`), wdraża na Cloud Run, sprawdza `/api/health`
backendu i stronę główną frontu, a na koniec usuwa lokalne obrazy. Przy niezacommitowanych zmianach przerywa
(`--force` wdraża mimo to, z tagiem `-dirty-…`).

Klucze CDSE są w Secret Manager (`cdse-client-id`, `cdse-client-secret`), nie w obrazie. Zmiana klucza:

```bash
printf %s 'NOWA_WARTOSC' | gcloud secrets versions add cdse-client-secret --data-file=- --project asystent-wodny-hn26
./deploy.sh backend      # nowa rewizja pobiera najnowszą wersję sekretu
```

Jednorazowa konfiguracja (już zrobiona; do odtworzenia w innym projekcie): `gcloud projects create`, podpięcie
billingu, `gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com`,
`gcloud artifacts repositories create asystent --repository-format=docker --location=europe-central2`, utworzenie
obu sekretów i nadanie domyślnemu kontu serwisowemu Compute roli `roles/secretmanager.secretAccessor` do nich.

## Co liczy backend (z danych), a co jest jeszcze MOCK

| Element | Stan | Źródło / metoda |
|---|---|---|
| Granice, gmina, obręb, powierzchnia | ✅ | ULDK GUGiK (po numerze i kliknięciu na mapie) |
| Uprawa (bieżąca i w historii) | ✅ 2017–2026 / wybór rolnika | deklaracje ARiMR GSA (2025–26), mapa upraw Copernicus CLMS (2017–24, CDSE); inne lata → kafelki |
| Pogoda 30 lat przed datą, prognoza 16 dni | ✅ | Open‑Meteo (ERA5‑Land, Forecast); dla dat archiwalnych średnie z 10 lat |
| Kategoria gleby, działka nierolnicza | ✅ | IUNG‑PIB `Susza:katgl_landuse2024` |
| KBW vs progi suszy IUNG, historia 10 sezonów | ✅ | `dane/kbw_progi_iung.csv` (Rozp. MRiRW 2019) |
| Zapas wody w glebie, dni stresu | ✅ | bilans dobowy FAO‑56 + odpływ SCS‑CN (λ = 0,05) |
| Co czeka działkę (bez działań / z planem) | ✅ | scenariusze ESP z 10 sezonów |
| Zalecenia R5 (resztki/międzyplon), R7/R7‑/R8 (nawadnianie), R9 | ✅ | reguły z pipeline_plan.md §6 |
| Teren: spadki, spływ, zagłębienia, punkt wypływu | ✅ | Copernicus DEM 30 m od razu; NMT 1 m GUGiK pobierany w tle (1–3 min), potem raport liczy na nim |
| Rowy, rzeki, wody (odległość od działki) | ✅ | BDOT10k (paczka powiatu, HTTP Range, cache) |
| Wilgotność roślin, najsuchsza strefa | ✅ | Sentinel‑2 kompozyt z Sentinel Hub (CDSE, od 2015), zapas: Planetary Computer, Landsat 5/7/8/9; NDMI vs te same dni w poprzednich latach |
| Zalecenia R1–R4, R6 (zastawka, oczko, pas, mokradło, uprawa w poprzek stoku), przyczyny C4–C5 | ✅ | reguły z pipeline_plan.md §6 |
| Wyszukiwanie po gminie, obrębie i numerze | ✅ | ULDK GetParcelByIdOrNr |
| Tło suszy EDO (CDI), skład gleby SoilGrids | ✅ | EDO WMS (kolor piksela wg legendy), ISRIC SoilGrids |
| Asystent „Zapytaj” (LLM) | MOCK | wymaga klucza API modelu językowego (usługa płatna) |

## Struktura

```
backend/app/   main.py (API), analysis.py (diagnoza i reguły), facts.py (KBW, FAO‑56, scenariusze),
               terrain.py (DEM, NMT), bdot.py (BDOT10k), satellite.py (Sentinel‑2 / Landsat NDMI), context.py (EDO, SoilGrids), cdse.py (mapa upraw CLMS, Sentinel Hub),
               sources.py (ULDK, Open‑Meteo, IUNG, ARiMR, progi CSV), crops.py, geo.py, net.py (HTTP + cache), config.py (progi ⚙️)
backend/tests/ testy jednostkowe
frontend/      PWA Next.js według makieta-ui/ (na razie dane przykładowe)
dane/          progi KBW IUNG
```

Dokumentacja merytoryczna: [METODY.md](METODY.md), [pipeline_plan.md](pipeline_plan.md), [ZRODLA_DANYCH.md](ZRODLA_DANYCH.md),
[TEST_API.md](TEST_API.md), [USLUGI_Z_KONTEM.md](USLUGI_Z_KONTEM.md).
