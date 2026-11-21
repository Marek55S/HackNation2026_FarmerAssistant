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
| Wilgotność roślin, najsuchsza strefa | ✅ | Sentinel‑2 kompozyt z Sentinel Hub (CDSE, od 2015), zapas: Planetary Computer, Landsat 5/7/8/9; NDMI względem tych samych dni **w sezonach z tą samą grupą upraw** (zboża, kukurydza, rzepak, okopowe, użytki zielone); przy < 3 takich sezonach – brak oceny z podaniem przyczyny |
| Zalecenia R1–R4, R6 (zastawka, oczko, pas, mokradło, uprawa w poprzek stoku), przyczyny C4–C5 | ✅ | reguły z pipeline_plan.md §6 |
| Zlewnia rowu, stan rzek, susza hydrologiczna | ✅ | MPHP10k Wody Polskie (zlewnia elementarna → R1), IMGW‑PIB: najbliższy wodowskaz i ostrzeżenia „Susza hydrologiczna” dla województwa (→ R7/R8, priorytet retencji); stany i ostrzeżenia tylko dla analizy na dziś |
| Wyszukiwanie po gminie, obrębie i numerze | ✅ | ULDK GetParcelByIdOrNr |
| Tło suszy EDO (CDI), skład gleby SoilGrids | ✅ | EDO WMS (kolor piksela wg legendy), ISRIC SoilGrids |

Raport idzie w kolejności zadania KOWR (3.3 pkt 4–5): **stan na dzień D** → **jak często brakowało wody w 10 sezonach**
(każdy sezon oceniony dla uprawy, która wtedy rosła) → przyczyny → plan na działce → scenariusze „jak bywało” → źródła i braki.

## Struktura

```
backend/app/   main.py (API), analysis.py (diagnoza i reguły), facts.py (KBW, FAO‑56, scenariusze),
               terrain.py (DEM, NMT), bdot.py (BDOT10k), satellite.py (Sentinel‑2 / Landsat NDMI), context.py (EDO, SoilGrids), cdse.py (mapa upraw CLMS, Sentinel Hub),
               hydro.py (MPHP10k, IMGW hydro), sources.py (ULDK, Open‑Meteo, IUNG, ARiMR, progi CSV), crops.py, geo.py,
               net.py (HTTP + cache), raport_front.py (JSON raportu dla frontu), config.py (progi ⚙️)
backend/tests/ testy jednostkowe (bez sieci)
frontend/      PWA Next.js (App Router) – ekran startu i raport na danych z backendu
dane/          progi KBW IUNG (jedyne dane przygotowane wcześniej)
makieta-ui/    makiety ekranów (specyfikacja wyglądu)
```

Dokumentacja merytoryczna: [METODY.md](METODY.md), [pipeline_plan.md](pipeline_plan.md), [ZRODLA_DANYCH.md](ZRODLA_DANYCH.md),
[TEST_API.md](TEST_API.md), [USLUGI_Z_KONTEM.md](USLUGI_Z_KONTEM.md).

## Architektura (4.2 pkt 3)

```
przeglądarka (PWA, Next.js) ──► trasy API frontu (/api/parcel, /api/analyze, /raport) ──► backend FastAPI (/api/dzialka, /api/raport)
                                                                                              │  równolegle, z limitem czasu na źródło
        ULDK · Open‑Meteo · IUNG · ARiMR · CLMS · Sentinel‑2/Landsat · DEM/NMT · BDOT10k · MPHP · IMGW · EDO · SoilGrids
                                                                                              │
                                                              fakty → diagnoza → reguły R1–R9 → raport JSON
```

- Backend pobiera dane źródłowe przy każdej analizie i liczy wynik od zera. Gotowych rekomendacji nie ma.
- Każde źródło zwraca albo dane, albo jawny brak z powodem (`net.Wynik`). Wolne źródła kontekstowe mają limit czasu
  (`config.BUDZET_*`), więc nie zatrzymują raportu, a brak trafia do sekcji „Czego nie sprawdziliśmy”.
- Cache dyskowy (`backend/.cache`) przyspiesza powtórki, ale nie zmienia sposobu liczenia. Dane bieżące (stany rzek IMGW)
  mają ważność 30 min.

## Źródła i zakresy danych (4.2 pkt 4–5)

Wszystko poza progami IUNG jest pobierane **na bieżąco, przy każdej analizie** (pierwsze pobranie dla działki może
trafić do cache).

| Dane | Źródło | Zakres używany w analizie |
|---|---|---|
| granice, gmina, obręb | ULDK GUGiK | stan obecny (także dla dat archiwalnych) |
| pogoda dobowa (opad, ET0 FAO‑56, Tmax) | Open‑Meteo, ERA5‑Land | 31 lat przed datą D (norma 30‑letnia, historia 10 sezonów, bilans) |
| prognoza | Open‑Meteo Forecast | 16 dni, tylko gdy D = dziś; dla dat archiwalnych średnia z 10 lat |
| kategoria podatności gleby | IUNG‑PIB WMS `katgl_landuse2024` | stan obecny |
| progi suszy KBW | IUNG‑PIB, Rozp. MRiRW 2019 | **przygotowane wcześniej:** `dane/kbw_progi_iung.csv` (dodane do repo 21.11.2026) |
| uprawa w danym roku | ARiMR GSA (2025–2026), Copernicus CLMS Crop Types (2017–2024) | rok D i 10 sezonów wstecz |
| wilgotność roślin NDMI | Sentinel‑2 L2A (od 07.2015), Landsat 5/7/8/9 | zdjęcie z ok. 20 dni przed D; odniesienie: te same dni w sezonach z tą samą grupą upraw |
| teren | Copernicus DEM 30 m, NMT 1 m GUGiK (w tle) | stan obecny |
| rowy, cieki, wody | BDOT10k | stan obecny |
| zlewnia rowu | MPHP10k (Wody Polskie) | stan obecny |
| stany rzek, ostrzeżenia hydrologiczne | IMGW‑PIB | tylko bieżące (analiza na dziś) |
| tło suszy | EDO Combined Drought Indicator | dekada obejmująca D |
| skład gleby | ISRIC SoilGrids 250 m | stan obecny |

## Biblioteki, usługi i AI (4.2 pkt 6)

- Backend: FastAPI, uvicorn, httpx, numpy, rasterio, pyproj, remotezip, pytest ([backend/requirements.txt](backend/requirements.txt)).
- Frontend: Next.js 16, React 19, MapLibre GL, Tailwind CSS 4, fonty Inter / Red Hat Display (Fontsource)
  ([frontend/package.json](frontend/package.json)).
- Usługi zewnętrzne: wszystkie źródła z tabeli wyżej, Sentinel Hub (konto CDSE w zmiennych środowiskowych serwera),
  Microsoft Planetary Computer (bez konta).
- **AI w wyniku:** brak modeli językowych. Diagnoza i zalecenia to deterministyczne reguły na faktach z danych
  ([pipeline_plan.md](pipeline_plan.md) §0, §6). Jedyny produkt uczenia maszynowego to mapa upraw Copernicus CLMS Crop Types,
  wykorzystana jako dana wejściowa.
- **AI przy tworzeniu:** kod i dokumentację pisano z pomocą asystenta AI (Claude Code). Wyniki sprawdzono testami i ręcznie
  (sekcja „Weryfikacja”).

## Licencje i warunki (4.2 pkt 7)

Tabela atrybucji: [ZRODLA_DANYCH.md](ZRODLA_DANYCH.md) §8. W skrócie:
- GUGiK (ULDK, BDOT10k, NMT): dane PZGiK, bezpłatnie;
- Open‑Meteo: CC BY 4.0, darmowe API tylko do użytku niekomercyjnego, ERA5 © ECMWF/Copernicus;
- Copernicus (Sentinel, CLMS, EDO): pełny i otwarty dostęp;
- SoilGrids: CC BY 4.0;
- Landsat: domena publiczna;
- IMGW‑PIB: wymagana informacja „Źródłem pochodzenia danych jest IMGW‑PIB” (dane przetworzone);
- IUNG‑PIB, ARiMR, Wody Polskie (MPHP): dane publiczne z atrybucją instytucji; warunki ponownego wykorzystania WMS IUNG
  i ARiMR do potwierdzenia.

Biblioteki: licencje open source (m.in. MIT: FastAPI, Next.js, React, Tailwind, pyproj; BSD: numpy, httpx, rasterio,
MapLibre GL); fonty Inter i Red Hat Display: SIL Open Font License.

## Znane ograniczenia (4.2 pkt 8)

- **Rozdzielczość:** ERA5‑Land ma oczko ok. 9 km, więc pogoda nie rozróżnia sąsiednich działek. Gleba i teren różnicują
  wynik w obrębie działki.
- **Dane z dziś przy dacie archiwalnej:** granice, rowy, teren i mapa gleb są w stanie obecnym także dla dat archiwalnych.
- **Satelita:**
  - porównujemy tylko sezony z tą samą grupą upraw; przy mniej niż 3 takich sezonach albo przy polu bez roślin
    nie oceniamy stanu roślin;
  - przed 2018 r. Sentinel‑2 ma zwykle za mało lat odniesienia.
- **Uprawa w historii:** jest znana tylko dla lat 2017–2026. Dla wcześniejszych lat przyjmujemy bieżącą uprawę
  (w raporcie oznaczone gwiazdką).
- **Bilans wody FAO‑56:**
  - jesienny wysiew kolejnej uprawy pomijamy;
  - poza wegetacją Kc = 0,3;
  - nie uwzględniamy wód gruntowych ani drenowania.
- **Hydrologia:**
  - stany rzek i ostrzeżenia IMGW są tylko bieżące;
  - ostrzeżenia dopasowujemy po województwie, bo nie znaleźliśmy publicznej warstwy zlewni prognostycznych IMGW;
  - API IMGW nie podaje przepływu niskiego SNQ;
  - zlewnia MPHP to zlewnia cieku, czyli przybliżenie zlewni rowu.
- **Progi ⚙️** (grupy łanu, wielkość zlewni dla R1, promień wodowskazu, wartości w `config.py`) są robocze i nie były
  jeszcze kalibrowane z mentorami.
- **Limity Open‑Meteo:**
  - darmowe API ma dzienny limit zapytań na adres IP;
  - pobranie 31 lat pogody liczy się jako wiele wywołań;
  - po przekroczeniu limitu raport mówi wprost „Brak danych pogodowych (HTTP 429)” i nie liczy oceny
    (zaobserwowane 21.11.2026 przy intensywnych testach).

## Weryfikacja wyników (4.2 pkt 9)

- **Testy jednostkowe:** `cd backend && python -m pytest -q`, bez sieci. Obejmują:
  - progi IUNG, KBW, SCS‑CN i bilans FAO‑56;
  - bilans z uprawą zmieniającą się co rok;
  - wybór lat odniesienia satelity (grupa łanu, rośliny na polu, mniej niż 3 lata);
  - parsowanie MPHP i IMGW;
  - opis efektu planu.
- **Sprawdzenie ręczne na prawdziwych działkach** (21.11.2026):
  - Szubin `041005_5.0008.57/11`, 15.07.2018, kukurydza: susza 2018, kryterium IUNG spełnione, zapas poniżej progu
    stresu, zalecenie podlania;
  - Krzywda `061104_2.0001.100`, 21.11.2026, pszenica: poza sezonem, pełny zapas wody, 3 z 10 sezonów z suszą,
    zlewnia MPHP i aktywne ostrzeżenie IMGW o suszy hydrologicznej w zlewni Wieprza.
- **Porównanie z oficjalnym monitoringiem (do zrobienia):** flagi suszy z tabelami SMSR IUNG dla gmin
  (`susza.iung.pulawy.pl/wykazy/{rok},{TERYT7}/`) oraz z EDO CDI.

## Skalowalność i koszty (5.4, 5.5)

- **Limity źródeł:**
  - pogoda pobierana w siatce zaokrąglonej do 0,05°, więc sąsiednie działki dzielą jedno zapytanie (cache);
  - listy wodowskazów i ostrzeżeń IMGW: jedno pobranie na cały kraj co 30 min;
  - zlewnie MPHP, mapa upraw i BDOT10k (paczka powiatu) w cache na stałe;
  - przy wielu użytkownikach potrzebny jest płatny plan Open‑Meteo albo własna instancja Open‑Meteo
    (oprogramowanie open source) z danymi ERA5‑Land, bo darmowe API ma dzienny limit.
- **Aktualizacja danych:** pogoda codziennie, z ok. 1–2 dniami opóźnienia archiwum; Sentinel‑2 co kilka dni;
  ostrzeżenia IMGW na bieżąco. Dane stałe (gleby, teren, BDOT10k, MPHP) odświeżać przy nowych wydaniach.
- **Czas odpowiedzi:**
  - źródła są pobierane równolegle;
  - wolne źródła mają limit 8–12 s;
  - NMT 1 m pobiera się w tle;
  - zmierzono 23,5 s dla działki bez cache (21.11.2026, przed dodaniem hydrologii) i 2,5–9 s z częściowym cache.
- **Koszty:**
  - hosting kontenerów (np. Cloud Run) płatny za czas działania;
  - Sentinel Hub wymaga konta CDSE (darmowy limit), alternatywa bez konta: Planetary Computer;
  - przy skali krajowej dochodzą płatny plan Open‑Meteo albo serwer z własną kopią ERA5‑Land oraz miejsce na cache.
  - Ceny sprawdzić w aktualnych cennikach dostawców przed wdrożeniem.
