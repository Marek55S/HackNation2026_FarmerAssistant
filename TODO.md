# TODO – realizacja projektu krok po kroku

Lista zadań od pustego repo do zgłoszenia. Kolejność = kolejność pracy.
Odnośniki `P*`, `F*`, `C*`, `R*` to identyfikatory z [pipeline_plan.md](pipeline_plan.md). Metody: [METODY.md](METODY.md), źródła: [ZRODLA_DANYCH.md](ZRODLA_DANYCH.md), UI: [makieta-ui/](makieta-ui/).

Status: `[x]` zrobione · `[~]` częściowo · `[ ]` do zrobienia. Elementy niepodpięte są w aplikacji oznaczone etykietą **MOCK**.

Priorytety: **[MVP]** – bez tego nie ma zgłoszenia · **[+]** – mocno punktowane, robimy po MVP · **[opc]** – jeśli starczy czasu.

---

## Ścieżka krytyczna (najpierw „cienki” przepływ od końca do końca)

Zanim rozbudujemy cokolwiek, jedna działka ma przejść cały łańcuch, nawet w uproszczeniu:

```
numer działki → ULDK → Open‑Meteo (30 lat) → kategoria IUNG → KBW + próg (CSV) → bilans FAO‑56
→ diagnoza → 2–3 reguły (R5, R7/R7‑, R8) → raport HTML → PDF
```

Dopiero gdy to działa i jest wdrożone pod linkiem, dokładamy teren, satelitę, scenariusze i resztę reguł.

---

## 0. Organizacja i decyzje (pierwsza godzina)

- [x] **T0.1 [MVP]** Wybrać stack. — _backend: Python FastAPI + httpx + numpy + rasterio/pyproj (`backend/`); frontend: Next.js 16 + TypeScript + Tailwind jako PWA (`frontend/`), PDF przez druk przeglądarki_
- [ ] **T0.2 [MVP]** Wybrać hosting z publicznym linkiem dla jury (np. Render / Railway / Fly.io / VPS) i sprawdzić, że wychodzące zapytania do API GUGiK/IUNG działają z tego hosta.
  **Ustalono:** Google Cloud Run (`frontend/Dockerfile`); zapytań do GUGiK/IUNG z Cloud Run jeszcze nie sprawdzono.
- [ ] **T0.3 [MVP]** Podział ról: dane+fakty / teren+satelita / reguły+raport / frontend / dokumentacja+prezentacja.
- [~] **T0.4 [MVP]** Ustalić strukturę repo (`backend/`, `frontend/`, `dane/`, `docs/`, `tests/`) i dodać do gita `dane/kbw_progi_iung.csv` (teraz jest nieśledzony). — _częściowo: struktura backend/ + frontend/ jest; CSV progów nadal do dodania do gita_
- [ ] **T0.5 [MVP]** Repo prywatne + plan udostępnienia jury (instrukcja z platformy konkursowej).
- [ ] **T0.6 [+]** Umówić konsultacje z mentorami (lista ⚙️ z sekcji 11 pipeline'u) – najlepiej wcześnie, bo progi wpływają na reguły:
  - dr Bolewski: WOD/TAW dla kategorii IUNG, progi C1–C6, dawki nawadniania;
  - dr Gozdowski: kalendarz faz upraw, okna wrażliwości, próg z‑score NDMI;
  - T. Rychlicki: NMT WCS, BDOT10k, GSA ARiMR;
  - B. Czerniejewski: przegląd makiety i języka raportu.

## 1. Szkielet aplikacji

- [x] **T1.1 [MVP]** Backend: endpoint `POST /api/analyze {dzialka, data}` → JSON raportu; `GET /api/health`. — _`POST /api/analiza`, `POST /api/dzialka`, `GET /api/health`, `GET /api/uprawy`_
- [~] **T1.2 [MVP]** Model danych: `Fakt {id, wartość, jednostka, źródło, data_pobrania, dostępny, powód_braku}`, `Zalecenie {reguła, co, gdzie, kiedy, ile, bo[], co_zyskasz, fakty[]}`, `Raport`. — _częściowo: model jako dict/JSON, bez klas_
- [x] **T1.3 [MVP]** Warstwa pobierania: klient HTTP z timeoutami, retry, równoległością (`asyncio.gather`) i cache na dysku (klucz = źródło + parametry + data `D`). — _backend/app/net.py_
- [x] **T1.4 [MVP]** Zasada „brak danych = komunikat”: każdy pobieracz zwraca wynik albo jawny brak z powodem, nigdy wyjątek, który zabija analizę. — _zrobione_
- [x] **T1.5 [MVP]** Konfiguracja wszystkich progów ⚙️ w jednym pliku (`config/progi.yaml`), żeby kalibracja nie wymagała zmian w kodzie. — _zrobione jako backend/app/config.py_
- [x] **T1.6 [MVP]** Frontend: pusty szkielet z routingiem Start → Postęp → Raport, wywołanie API. *(UI gotowe na mocku w `frontend/`; podpięcie do backendu – T10.10)*

## 2. Etap 1 – lokalizacja działki

- [x] **T2.1 [MVP]** ULDK `GetParcelById` (identyfikator EGiB) → WKT, TERYT, gmina, obręb. — _zrobione_
- [x] **T2.2 [MVP]** ULDK `GetParcelByXY` (klik na mapie). — _Leaflet + OSM na ekranie startowym_
- [x] **T2.3 [+]** ULDK `GetParcelByIdOrNr` (gmina + obręb + numer) z podpowiadaniem obrębów. — _ULDK GetParcelByIdOrNr, `GET /api/szukaj`, lista przy wielu trafieniach, filtr gminy_
- [~] **T2.4 [MVP]** Geometria: centroid (WGS84), bbox, bufor +500 m, bufor −10 m, powierzchnia (w EPSG:2180). — _częściowo: centroid, pole, punkty wewnątrz; bez buforów (potrzebne przy satelicie i terenie)_
- [x] **T2.5 [MVP]** Obsługa braku działki: komunikat „wskaż ją na mapie” → analiza na geometrii z kliknięcia. — _zrobione_
- [x] **T2.6 [MVP]** Wykrycie działki nierolniczej z warstwy IUNG (kody 11 las, 12 woda, 13 zabudowa, 14 drogi/nieużytki – zob. A4) → „Poza zakresem”. — _zrobione_

## 3. Etap 2 – pobieranie danych

Każde źródło: funkcja pobierająca + fallback + zapis źródła i daty pobrania do raportu + ucięcie do `D`.
**Jak dokładnie obsłużyć każde API (zapytania, parsowanie, czasy, pułapki): [Dodatek A](#dodatek-a--jak-obsługiwać-każde-api).**
Wyniki testów wszystkich źródeł: [TEST_API.md](TEST_API.md).

**Grupa A – rdzeń [MVP]**
- [x] **T3.1** P1+P2 Open‑Meteo Archive: opad, ET0, Tmax, Tmin **i wilgotność gleby (dobowe `_mean`)**, 30 lat przed `D`, jedno zapytanie (~2,5 s) → [A2](#a2-open-meteo-archive--pogoda-i-wilgotność-gleby-p1-p2). — _zrobione_
- [x] **T3.2** P3 prognoza 16 dni (gdy `D` = dziś) / klimatologia z 10 lat (dla dat archiwalnych) → [A3](#a3-open-meteo-forecast--prognoza-p3). — _zrobione_
- [x] **T3.3** P4 IUNG WMS `Susza:katgl_landuse2024` – GetFeatureInfo w 5–9 punktach → kategoria I–IV, gleba organiczna (kod 5), działka nierolnicza (11–19) → [A4](#a4-iung--kategoria-gleby-i-pokrycie-terenu-p4). — _zrobione_
- [x] **T3.4** P5 SoilGrids – **tylko 1–2 głębokości** (pełne zapytanie 10–14 s), cache, fallback z kategorii IUNG → [A5](#a5-soilgrids--skład-i-retencja-gleby-p5). — _SoilGrids 2 głębokości + cache – backend/app/context.py; skład gleby i SOC (F6c) w raporcie_
- [x] **T3.5** P6 wczytanie `dane/kbw_progi_iung.csv` + tabela mapowania nazw upraw z ARiMR na wiersze CSV → [A6](#a6-progi-kbw-iung--csv-p6). — _tabela upraw: backend/app/crops.py_
- [x] **T3.9 (przeniesione do MVP)** P11 uprawa z deklaracji ARiMR → podpowiedź w UI, rolnik może zmienić; brak danych → wybór z kafelków → [A10](#a10-arimr-gsa--uprawy-p11). — _ARiMR WFS 2025–2026 + mapa upraw Copernicus (CLMS) 2017–2024 przez CDSE; shapefile ARiMR 2020–2024 – niepotrzebne_

**Grupa B – teren, woda, satelita [+]**
- [x] **T3.6** P7 teren: **Copernicus DEM 30 m na pierwszy wynik** (< 1 s); NMT 1 m z GUGiK (60–117 s) jako zadanie w tle z cache, po pobraniu przeliczyć F7/F8 → [A7](#a7-teren--copernicus-dem-30-m-i-nmt-1-m-gugik-p7). — _Copernicus DEM 30 m od razu; NMT 1 m GUGiK pobierany w tle po wskazaniu działki (60–180 s), potem analiza na nim (uśredniony do 5 m)_
- [x] **T3.7** P8 rowy/cieki/zbiorniki: **BDOT10k – z ZIP-a powiatu tylko 4 pliki hydrografii przez HTTP Range (~2 MB, 1–2 s)**. OSM Overpass **nie używać** (brak rowów) → [A8](#a8-bdot10k--rowy-rzeki-wody-p8). — _HTTP Range (remotezip), parsowanie raz na powiat + cache – backend/app/bdot.py_
- [x] **T3.8** P10 satelita: **Planetary Computer** (bez konta) – Sentinel‑2 L2A 2016+, Landsat C2 L2 2006–2016, MODIS jako tło; odczyt tylko pikseli działki z COG → [A9](#a9-planetary-computer--sentinel-2-landsat-modis-p10). — _Sentinel‑2 L2A (2016+) z zapasem Landsat 5/7/8/9 (anomalia w obrębie rodziny czujników); MODIS – nie_

**Grupa C – kontekst [opc]**
- [ ] ~~T3.10 P2 osobno~~ → wchodzi w T3.1.
- [ ] ~~T3.11 IUNG GAEC2~~ → niepotrzebne, gleby organiczne to kod 5 w T3.3.
- [x] **T3.12** P12 EDO WMS – tylko porównanie (GetMap zwraca obrazek, wartość z koloru legendy) → [A11](#a11-edo--tło-suszy-p12-opcjonalnie). — _EDO CDI z koloru piksela GetMap (legenda: obserwacja / ostrzeżenie / alarm), dekada ≤ D_
- [ ] **T3.13** P13 IMGW hydro – stan rzek jako kontekst (tylko `D` = dziś) → [A12](#a12-imgw--rzeki-i-stacje-p13-opcjonalnie).

## 4. Etap 3 – fakty rdzeniowe (meteo + gleba + uprawa)

- [x] **T4.1 [MVP]** F13 tryb daty (sezon 21.III–30.IX / poza sezonem). — _zrobione_
- [x] **T4.2 [MVP]** F6, F6b, F6c: kategoria gleby, TAW (SoilGrids albo WOD z kategorii), węgiel organiczny. — _kategoria IUNG + TAW z WOD; SoilGrids – skład, SOC (F6c), θFC/θWP w szczegółach_
- [x] **T4.3 [MVP]** F1 KBW 60 dni w ostatnim pełnym okresie 6‑dekadowym ≤ `D`; F2 próg z CSV; F3 susza teraz. — _zrobione_
- [x] **T4.4 [MVP]** Tabela upraw: Kc w fazach, p (FAO‑56), głębokość korzeni, kalendarz faz dla Polski, okna wrażliwości → F12. — _backend/app/crops.py (wartości ⚙️)_
- [x] **T4.5 [MVP]** F4 bilans wody w strefie korzeniowej FAO‑56 od 1.III (opad efektywny, ET0 × Kc, ograniczenie do [0, TAW]); F4p próg stresu. — _zrobione_
- [x] **T4.6 [MVP]** F11 opad efektywny w prognozie 7 dni. — _zrobione_
- [x] **T4.7 [MVP]** F5 częstość suszy w 10 sezonach (dla uprawy z danego roku) + miesiące z największą liczbą przekroczeń. — _zrobione_
- [~] **T4.8 [+]** F5s potrzeba wody w oknie wrażliwym (mediana, p80). — _częściowo: potrzeba wody w oknie (mediana/p80) liczona w R8_
- [~] **T4.9 [+]** F14 opad vs norma 30‑letnia + SPI‑2/SPEI‑2; F15 dni upału i ET0 vs norma. — _częściowo: F14, F15 tak; SPI/SPEI – nie_
- [x] **T4.10 [MVP]** F0 uprawa – przepływ ustalony: — _podpowiedź: ARiMR (2025–26) → mapa upraw Copernicus (2017–24) → kafelki; F0h: każdy sezon z uprawą z tego roku_
  1. po wskazaniu działki pytamy ARiMR (A10) o uprawę w roku `D`;
  2. **jest** → podpowiedź „wg deklaracji ARiMR {rok}: {uprawa}”, kafelki zwinięte pod „Zmień” – rolnik może ją zamienić;
  3. **nie ma** (rok bez danych: 2016, 2017, 2019, brak deklaracji, błąd usługi) → kafelki rozwinięte, rolnik wybiera;
  4. wybór rolnika zawsze wygrywa i jest opisany w raporcie jako „wybrane przez rolnika”.
  F0h uprawy historyczne: ARiMR 2020–2026, JRC 2018/2022; lata bez danych → ML1 (T4.11), a bez ML1 → uprawa wybrana dla `D` + adnotacja.
- [ ] **T4.11 [+]** **ML1 – rozpoznawanie uprawy z serii zdjęć** (METODY.md §8; uzasadnienie: zadanie 5.1, PolSA rozdz. 2 i 6.3.4):
  1. Próbka etykiet: deklaracje ARiMR GSA 2020–2025 (`roslina` → klasy wierszy CSV progów, `config/uprawy.yaml`) z 2–3 województw, kilka tys. działek na klasę; geometrie z buforem −10 m.
  2. Cechy: miesięczne mediany NDVI, NDMI i pasm S2 (III–X) z Planetary Computer, tak samo liczone jak w T3.8; opcjonalnie S1 VV/VH.
  3. Model: LightGBM / RandomForest; trening 2020–2023, test na 2024–2025 i na województwie spoza treningu; dokładność i macierz pomyłek per klasa do README.
  4. Drugi model na cechach Landsata 8 (trening 2020+) → lata 2013–2015; dla 2006–2012 (Landsat 5/7) oznaczyć niższą pewność.
  5. W aplikacji: tylko predykcja na cechach działki (ms) + pewność klasy; niepewna → kafelki (T4.10). Model, wersja i data treningu do README (wymóg 4.2 pkt 5–6).

## 5. Etap 3 – fakty przestrzenne (teren, woda, satelita) [+]

- [x] **T5.1** F7 spadek z NMT (maks., średni, strefy > 3%). — _spadek średni, p95, udział > 3%_
- [x] **T5.2** F7b kierunki i akumulacja spływu (D8), punkty wypływu na granicy; udział odpływu SCS‑CN. — _D8 na wypełnionym DEM, punkt wypływu i udział działki; odpływ SCS‑CN z ulew > 10 mm_
- [x] **T5.3** F8 zagłębienia (wypełnianie, próg 0,1 m) – poligon, powierzchnia, objętość. — _priority‑flood, głębokość > 0,1 m, powierzchnia i objętość; duże obniżenia poza działką odfiltrowane_
- [x] **T5.4** F9 najbliższy rów/ciek/zbiornik: odległość, typ, punkt najbliżej działki; F9b gleba organiczna. — _rów/kanał, rzeka, wody – odległość od granicy działki i najbliższy punkt_
- [x] **T5.5** F10 najsuchsza strefa: z‑score NDMI względem tych samych tygodni z lat okna → poligon; F10b mediana z‑score. — _z‑score NDMI per piksel vs te same dni w latach 2016+ (min. 3 czyste sceny), strefa z < −1_
- [x] **T5.6** Zapis wszystkich geometrii (strefy, punkty, poligony) jako GeoJSON do warstw mapy w raporcie. — _warstwy mapy liczone w backendzie (układ 300×200 jak makieta)_

## 6. Etap 3b – prognoza scenariuszowa (wyróżnik projektu) [+]

- [x] **T6.1** F17: N trajektorii bilansu FAO‑56 od zapasu z dnia `D` przez pogodę N poprzednich sezonów (N = 10 albo 30, rozstrzyga T12.8; pierwsze dni z prognozy, gdy `D` = dziś). — _zrobione_
- [x] **T6.2** F18 ryzyko stresu w czasie (tydzień/miesiąc, udział przebiegów, w raporcie „x/N”), F18d mediana dnia przekroczenia progu. — _zrobione_
- [x] **T6.3** F19 przewidywany brak wody (mediana, p80). — _zrobione_
- [x] **T6.4** F20 efekt działań: przebiegi z parametrem zmienionym przez działanie (tabela w pipeline 4b) → „co zyskasz”. — _resztki/mulcz i nawadnianie; retencja (R1–R3) po T5_
- [x] **T6.5** F21 ryzyko z całym planem („bez działań” vs „z planem”). — _zrobione_
- [x] **T6.6** Poza sezonem: scenariusz przez zimę do 30.IX kolejnego roku, uprawa przewidywana z płodozmianu F0h. — _uprawa przewidywana = bieżąca (płodozmian po T4.11)_

## 7. Etap 4 – diagnoza

- [x] **T7.1 [MVP]** Etykieta i zdanie główne (5.1): Susza nadchodzi / Zagrożenie / Spokojnie / Plan na sezon / Poza zakresem. W MVP z F3/F4, po T6 z F18. — _zrobione_
- [x] **T7.2 [MVP]** Dopisek „brak urzędowego progu” dla upraw bez wiersza w CSV. — _zrobione_
- [x] **T7.3 [+]** Pewność (wysoka/średnia/niska) z 4 sygnałów; nazwane braki danych obniżają pewność. — _4 sygnały: opady/próg IUNG, bilans FAO‑56, satelita (NDMI), EDO CDI_
- [x] **T7.4 [MVP]** Przyczyny C1–C6 z oceną 0–3, podział: pogoda vs stałe cechy działki. — _C1–C6 z danych_

## 8. Etap 5 – reguły zaleceń

- [x] **T8.1 [MVP]** Silnik reguł: warunek → zalecenie z polami co/gdzie/kiedy/ile/bo; szablony zdań wypełniane faktami; kolejność retencja → pole → nawadnianie; maks. 6; wybór „PILNE”. — _zrobione_
- [x] **T8.2 [MVP]** R5 międzyplon/resztki, R7 nawadnianie teraz (dawka, objętość), R7‑ nie podlewaj, R8 plan nawadniania. — _zrobione_
- [x] **T8.3 [+]** R1 zastawka na rowie, R2 zagłębienie/oczko, R3 pas buforowy, R6 uprawa w poprzek stoku (wymagają T5). — _R1 (rów ≤ 100 m), R2 (zagłębienie), R3 (pas przy wypływie), R6 (C4 ≥ 2); piny w prawdziwych miejscach_
- [~] **T8.4 [opc]** R4 ochrona mokradła/gleby organicznej, R9 inna uprawa / termin siewu. — _R4 (gleba organiczna, kod 5 IUNG) i R9 – tak; TWI – nie_
- [x] **T8.5 [MVP]** „Gdy żadna reguła się nie uruchomi” + sekcja „Czego nie sprawdziliśmy” (reguły zablokowane brakiem faktów). — _lista braków danych w „Skąd wiemy”_
- [x] **T8.6 [+]** Warunki patrzące w przód: zamiana `F5 ≥ 3/10` na `F18 ≥ 30%` przebiegów po wdrożeniu T6; „co zyskasz” z F20. — _zrobione_

## 9. Tryby zależne od daty

- [x] **T9.1 [MVP]** Ucięcie wszystkich zapytań do `D` (meteo, satelita `datetime ≤ D`); test, że nic z przyszłości nie wchodzi. — _zrobione_
- [x] **T9.2 [MVP]** Data historyczna: klimatologia zamiast prognozy + komunikat. — _zrobione_
- [x] **T9.3 [MVP]** Poza sezonem: R1–R6 z terminem „teraz”, R8 zamiast R7. — _zrobione_
- [ ] **T9.4 [+]** Początek sezonu (brak pełnego okresu 60 dni): KBW z niepełnego okresu + obniżona pewność.
- [ ] **T9.5 [+]** Adnotacje o danych w stanie obecnym (ULDK, BDOT10k, NMT, mapa gleb) i o sensorze satelitarnym per rok.

## 10. Frontend (wg makiety)

- [ ] **T10.1 [MVP]** Ekran Start (kolejność: najpierw data, potem działka – uprawa zależy od roku daty): pole identyfikatora działki + mapa z klikiem, data (domyślnie dziś, zakres 10 lat), uprawa: podpowiedź z ARiMR + „Zmień” albo kafelki, gdy brak podpowiedzi (T4.10; makieta `Main.dc.html`).
- [x] **T10.2 [MVP]** Ekran postępu analizy (kroki pobierania, czas, błędy źródeł). *(UI gotowe na mocku w `frontend/`)*
- [x] **T10.3 [MVP]** Raport: „Co Cię czeka”, „Pilne”, „Co zrobić i gdzie” (karty z „bo…”), „Co zwiększa ryzyko”, „Skąd wiemy” (źródła, daty, ograniczenia). *(UI gotowe na mocku w `frontend/`)*
- [ ] **T10.4 [+]** Mapa działki z widokami: plan (numery zaleceń) / gdzie sucho / teren i spływ / gleba; podkład ortofoto lub OSM.
- [ ] **T10.5 [+]** Wykres „Ryzyko w kolejnych miesiącach” bez działań vs z planem (F18/F21) i brak wody (F19).
- [x] **T10.6 [+]** Zwinięte uzasadnienie: kryterium IUNG teraz (F3) i historia 10 lat (F5, F0h). *(UI gotowe na mocku w `frontend/`)*
- [x] **T10.7 [+]** Wersja mobilna (makieta `Mobile.dc.html`) – działa w przeglądarce telefonu. *(UI gotowe na mocku w `frontend/`)*
- [x] **T10.8 [MVP]** Stany: ładowanie, błąd ULDK, brak danych źródła, działka poza zakresem. *(UI gotowe na mocku w `frontend/`)*
- [x] **T10.9 [opc]** Panel gospodarstwa: kilka działek zapisanych lokalnie (bez danych osobowych). *(UI gotowe na mocku w `frontend/`)*
- [x] **T10.10 [MVP]** Podpiąć frontend Next.js do backendu: `POST /api/dzialka` (działka + podpowiedź uprawy dla roku daty), `GET /api/szukaj` (gmina/obręb/numer), `POST /api/analiza` (raport: `status`, `akcje`, `przyczyny`, `ryzyko`, `historia`, warstwy mapy `teren` i `sucho`, `zrodla`, `braki`) zamiast `frontend/src/lib/mock`. — _zrobione: front bez mocka; backend `/api/raport` zwraca `Report`; mapa wyboru z polami ARiMR (klik = działka z ULDK)_

## 11. Zapis raportu (wymóg 3.3 pkt 6)

- [x] **T11.1 [MVP]** Widok do druku A4 (CSS `@media print`, makieta `Pdf.dc.html`) + przycisk „Drukuj / Zapisz PDF”. *(UI gotowe na mocku w `frontend/`)*
- [ ] **T11.2 [+]** Generowanie pliku PDF po stronie serwera (z mapą jako obrazem).
- [ ] **T11.3 [opc]** Zapis raportu w systemie (link do raportu / pobranie JSON).

## 12. Jakość, testy, wydajność

- [x] **T12.1 [MVP]** Testy jednostkowe: KBW i dobór okresu, odczyt progu z CSV, bilans FAO‑56, każda reguła (wejście → oczekiwana reguła). — _backend/tests/test_core.py (10 testów)_
- [ ] **T12.2 [MVP]** Zestaw testowych działek z różnych regionów Polski (piaski Wielkopolski, lessy Lubelszczyzny, Żuławy, teren górzysty, działka nierolnicza) × daty (dziś, lipiec 2018, listopad 2019, 2016).
- [ ] **T12.3 [MVP]** Pomiar czasu analizy; cel < 30 s; profilowanie najwolniejszych źródeł (satelita, NMT).
- [ ] **T12.4 [+]** Backtest 2015/2018/2019 vs SMSR IUNG i EDO CDI + kontrola w latach wilgotnych (2017) → macierz zgodności do README.
- [ ] **T12.5 [MVP]** Test w Chrome, Firefox, Edge, Safari, Opera na Windows.
- [ ] **T12.6 [MVP]** Bezpieczeństwo: walidacja wejścia (ID działki, data), limit zapytań na IP, brak danych osobowych, klucze API tylko w zmiennych środowiskowych, CORS, HTTPS.
- [ ] **T12.7 [+]** Rozgrzanie cache dla działek demo przed finałem (bez zmiany sposobu liczenia).
- [ ] **T12.8 [+]** Hindcast scenariuszy (METODY.md §7, analiza B): 30 lat, leave‑one‑out → Brier skill score i niezawodność progów 70%/30%; wybór N (10 vs 30) do README.

## 13. Wdrożenie

- [~] **T13.1 [MVP]** Dockerfile / skrypt startowy, zmienne środowiskowe, instrukcja uruchomienia lokalnie w README. — _częściowo: instrukcja w README; bez Dockerfile_
- [ ] **T13.2 [MVP]** Wdrożenie pod publicznym linkiem; sprawdzenie z innej sieci i na telefonie.
- [ ] **T13.3 [MVP]** Plan B na finał: wersja lokalna na laptopie + nagrany film na wypadek awarii zewnętrznych API.

## 14. Kalibracja (po konsultacjach z mentorami)

- [ ] **T14.1** Wprowadzić do `config/progi.yaml` wartości ustalone z mentorami (WOD, progi C1–C6, zagłębienia, odległość rowu, spadek, dawki, z‑score NDMI, kalendarz faz).
- [ ] **T14.2** Powtórzyć backtest (T12.4) po kalibracji.

## 14b. CDSE (podpięte)

- [x] OAuth z `backend/.env` (`CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`, poza gitem) – Sentinel Hub Process API: NDMI Sentinel‑2 od 07.2015 jako kompozyt leastCC (pierwsze źródło satelitarne; zapas: Planetary Computer → Landsat).
- [x] Mapa upraw CLMS 2017–2024: publiczna usługa podglądu CDSE + oficjalna paleta (kolor → klasa), 10 m; sprawdzone na polu z deklaracją ARiMR (owies → zboża).
- [ ] Daty wschodów/zbiorów, uprawa wtórna, wilgotność gleby CLMS SSM, DEM 10 m – wymagają pobierania plików (OData/S3), na które token klienta Sentinel Hub nie pozwala („Token audience not allowed”) – potrzebne konto z loginem/hasłem lub klucze S3.

## 15. Zgłoszenie (wymagania formalne, rozdz. 4)

- [ ] **T15.1 [MVP]** Nazwa zespołu i tytuł rozwiązania.
- [ ] **T15.2 [MVP]** Zwięzły opis: problem, główne funkcje, wykorzystanie danych, korzyści dla rolnika.
- [ ] **T15.3 [MVP]** README z 9 punktami z 4.2:
  1. instrukcja uruchomienia; 2. funkcjonalności; 3. architektura (diagram); 4. źródła i zakresy danych;
  5. co pobierane na bieżąco, co wcześniej (CSV progów IUNG, cache) + daty pobrania; 6. biblioteki, usługi, narzędzia AI;
  7. licencje (sekcja 8 ZRODLA_DANYCH.md); 8. znane ograniczenia; 9. sposób weryfikacji (testy, backtest).
- [ ] **T15.4 [MVP]** Opis roli AI (rozdz. 5.1, METODY.md §8): diagnoza i reguły deterministyczne; ML1 (i ewentualnie ML2–ML5) dostarcza faktów wejściowych – dane treningowe, walidacja, licencje; LLM tylko do redakcji tekstu (jeśli użyty); AI przy tworzeniu kodu.
- [ ] **T15.5 [MVP]** Sekcja skalowalności (5.5): cache, limity API, aktualizacja danych, koszty infrastruktury; płatne usługi i alternatywy (5.4).
- [ ] **T15.6 [MVP]** Bibliografia naukowa (z METODY.md) w README.
- [ ] **T15.7 [MVP]** Wygenerowane raporty PDF dla 2–3 działek przykładowych (sezon + poza sezonem) w repo.
- [ ] **T15.8 [MVP]** Prezentacja PDF ≤ 10 slajdów: problem → rozwiązanie → dane → metoda (KBW, FAO‑56, scenariusze) → demo (zrzuty) → walidacja → ograniczenia → rozwój.
- [ ] **T15.9 [MVP]** Film ≤ 3 min: wpisanie działki → raport → mapa → zalecenia → PDF.
- [ ] **T15.10 [MVP]** Udostępnienie prywatnego repo jury, link do działającej wersji, wysłanie zgłoszenia na platformie.
- [ ] **T15.11 [+]** Próba pitchu na żywo z działką i datą „od jury” (losowa działka, losowa data z 10 lat).

---

## Sugerowany plan czasowy (21–22.XI)

| Kiedy | Cel |
|---|---|
| Dzień 1, start | T0, T1, konsultacje z mentorami umówione |
| Dzień 1, popołudnie | T2, T3 grupa A, T4 MVP → pierwsza działka przechodzi cały łańcuch (JSON) |
| Dzień 1, wieczór | T7–T8 MVP, T10.1–T10.3, T11.1, pierwsze wdrożenie (T13.2) |
| Noc | T3 grupa B, T5, T6 (równolegle w podziale ról), T4.11 (ML1 – osobna osoba), T12.1–T12.2 |
| Dzień 2, rano | T8.3, T10.4–T10.7, kalibracja T14, testy T12.3–T12.6 |
| Dzień 2, przed oddaniem | zamrożenie funkcji, T15 (README, PDF raportów, prezentacja, film), T13.3 |

---

## Dodatek A – jak obsługiwać każde API

Wszystko sprawdzone na żywo 2026‑11‑21 ([TEST_API.md](TEST_API.md)). Czasy dotyczą jednego zapytania z Polski.

### A0. Zasady wspólne dla wszystkich pobieraczy

- Każdy pobieracz to funkcja `async` zwracająca `Wynik{dane | brak, powód, źródło, url, data_pobrania, czas_ms}`; **nigdy nie rzuca wyjątku dalej** (T1.4).
- Wszystkie źródła startują równolegle (`asyncio.gather`) zaraz po ULDK. Każde ma własny timeout, a analiza czeka maksymalnie ~25 s.
- Cache na dysku: klucz = `źródło + parametry + D`. Dane stałe (gleba, teren, rowy) cache'ujemy bez daty.
- Każda data końcowa = `min(D, wczoraj)`. Nic po `D` nie wchodzi do wyniku.
- Do raportu i README zapisujemy: nazwę źródła, URL bez tokenów, datę pobrania i licencję (sekcja 8 w ZRODLA_DANYCH.md).
- Biblioteki: `httpx` (async, timeouty), `shapely` + `pyproj` (geometrie, EPSG:4326 ↔ 2180), `rasterio` (COG/GeoTIFF), `pystac-client` + `planetary-computer` (STAC), `remotezip` (fragmenty ZIP), `pandas` / `numpy`.

### A1. ULDK – działka (etap 1)

| | |
|---|---|
| Po numerze | `GET https://uldk.gugik.gov.pl/?request=GetParcelById&id={ID}&result=geom_wkt,teryt,voivodeship,county,commune,region,parcel&srid=4326` |
| Z kliknięcia | `…?request=GetParcelByXY&xy={lon},{lat},4326&result=id,geom_wkt,teryt&srid=4326` |
| Gmina/obręb/numer | `…?request=GetParcelByIdOrNr&id={nazwa_obrębu} {numer}&result=id,teryt,commune,region` (spację zakodować `%20`) |
| bbox w EPSG:2180 | `…?request=GetParcelById&id={ID}&result=geom_extent&srid=2180` → `xmin,ymin,xmax,ymax` (x = wschód, y = północ) – do NMT, BDOT10k, ARiMR |
| Czas | 0,7–3 s · timeout 10 s · 1 ponowienie |

- Odpowiedź to **tekst**, nie JSON: linia 1 = status (`0` ok, `1`…`n` liczba wyników w ByIdOrNr, `-1 brak wyników`), kolejne linie = pola rozdzielone `|`.
- Geometria: `SRID=4326;POLYGON((…))` → zdjąć prefiks, wczytać `shapely.wkt.loads`.
- `-1` → komunikat „nie ma takiej działki w ewidencji — wskaż ją na mapie” (T2.5).
- Pochodne (T2.4): centroid, bufor −10 m (statystyki satelitarne), +300–500 m (teren, rowy); powierzchnie liczyć w EPSG:2180.

### A2. Open-Meteo Archive – pogoda i wilgotność gleby (P1, P2)

```
GET https://archive-api.open-meteo.com/v1/archive
  ?latitude={lat}&longitude={lon}
  &start_date={D − 30 lat}&end_date={min(D, wczoraj)}
  &daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min,
         soil_moisture_0_to_7cm_mean,soil_moisture_7_to_28cm_mean,soil_moisture_28_to_100cm_mean
  &timezone=Europe/Warsaw
```

- **Jedno zapytanie na całą analizę**: 30 lat przed `D` pokrywa i klimatologię SPEI, i 10 lat historii, i scenariusze. Zmierzone: 51 lat ~2,5 s, 11 lat ~0,9 s, 1976–2026 bez braków.
- Wilgotność gleby brać **dobową** (`*_mean`, 0,6 s). Godzinowa to 3,5 MB i 4 s.
- Siatka ERA5‑Land ma ~9 km → zaokrąglić współrzędne do 0,05° i cache'ować: sąsiednie działki trafią w cache.
- Odpowiedź JSON: `daily.time[]` + tablice wartości. Sprawdzić `null` (w teście 0) i ostatnią datę z danymi.
- Limit darmowy: niekomercyjny, ~10 000 zapytań/dzień. Licencja CC BY 4.0 – atrybucja „Open‑Meteo, ERA5 © ECMWF/Copernicus”.

### A3. Open-Meteo Forecast – prognoza (P3)

- Tylko gdy `D` = dziś: `GET https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&daily=precipitation_sum,et0_fao_evapotranspiration&forecast_days=16&timezone=Europe/Warsaw` (0,3 s).
- Dla dat archiwalnych **nie pytać**. Zamiast tego klimatologia z A2: średnie opadu i ET0 dla kolejnych 7–16 dni roku z 10 lat przed `D`, z komunikatem w raporcie.

### A4. IUNG – kategoria gleby i pokrycie terenu (P4)

```
GET https://sgeo.iung.pl/geoserver/Susza/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo
  &LAYERS=Susza:katgl_landuse2024&QUERY_LAYERS=Susza:katgl_landuse2024&SRS=EPSG:4326
  &BBOX={lon-0.0005},{lat-0.0005},{lon+0.0005},{lat+0.0005}&WIDTH=11&HEIGHT=11&X=5&Y=5
  &INFO_FORMAT=application/json
→ {"features":[{"properties":{"GRAY_INDEX":2}}]}
```

- 5–9 punktów rozłożonych wewnątrz działki (bufor −10 m), równolegle; ~0,5 s każdy.
- Kody `GRAY_INDEX`: **1–4** kategorie podatności (I bardzo podatna … IV mało podatna), **5** gleby organiczne, **11** lasy, **12** wody, **13** zabudowa, **14** drogi/nieużytki, **19/99** niesklasyfikowane, **0/255** brak danych.
- Wynik: dominanta wśród kodów 1–5 → F6; udział 5 → F9b (gleba organiczna); większość punktów 11–19 → działka nierolnicza (T2.6).
- WOD dla kategorii (do F6b, ⚙️): I < 127,5 mm, II 127,5–170, III 170–202,5, IV > 202,5 (strona IUNG „Kategorie gleb”).

### A5. SoilGrids – skład i retencja gleby (P5)

```
GET https://rest.isric.org/soilgrids/v2.0/properties/query?lon={lon}&lat={lat}
  &property=sand&property=clay&property=soc&property=wv0033&property=wv1500
  &depth=15-30cm&depth=30-60cm&value=mean
```

- **Maksymalnie 1–2 głębokości** (2 s). Pełne zapytanie (5 głębokości + kwantyle) trwa 10–14 s.
- Jedno zapytanie na centroid, cache na stałe (limit ~5 zapytań/min, serwis bywa wolny), timeout 15 s.
- Jednostki: `sand`, `clay` g/kg ×10 → %; `soc` dg/kg → g/kg; `wv0033`, `wv1500` ×10 → % obj. (wartość 381 = 38,1%).
- Na terenach miejskich wartości są `null` → brak = komunikat. Fallback: typowe θFC/θWP z kategorii IUNG (A4).

### A6. Progi KBW IUNG – CSV (P6)

- `dane/kbw_progi_iung.csv`, wczytany raz przy starcie. Kolumny: `uprawa`, `kategoria_gleby` (I–IV), 14 okresów 60‑dniowych. Puste = brak progu.
- Okres dla `D`: ostatni pełny okres 6‑dekadowy kończący się ≤ `D` (początki 21.III, 1.IV, 11.IV … co dekadę).
- **Tabela mapowania upraw ARiMR → wiersz CSV** (do zrobienia w `config/uprawy.yaml`):
  - pszenica/żyto/jęczmień/pszenżyto **ozime** → „Zboża ozime”; pszenica/jęczmień **jare**, owies → „Zboża jare”;
  - kukurydza na ziarno / na kiszonkę → osobne wiersze; rzepak i rzepik → „Rzepak i rzepik”; ziemniak, burak cukrowy, chmiel, tytoń, truskawki – wprost;
  - groch, bobik, łubin, soja, wyka → „Rośliny strączkowe”; warzywa → „Warzywa gruntowe”; sady → „Drzewa / Krzewy owocowe”;
  - lucerna, koniczyna, trawy, TUZ → **brak progu IUNG** → ocena z bilansu FAO‑56 + SPEI i dopisek w raporcie (T7.2).

### A7. Teren – Copernicus DEM 30 m i NMT 1 m GUGiK (P7)

**Szybko (pierwszy wynik):** Copernicus DEM GLO‑30
- Wyszukanie: `POST https://earth-search.aws.element84.com/v1/search` z `{"collections":["cop-dem-glo-30"],"intersects":<bbox działki + 500 m>}` → `assets.data.href` (`s3://copernicus-dem-30m/…`).
- Zamienić na HTTPS: `https://copernicus-dem-30m.s3.amazonaws.com/{ścieżka}` i czytać **tylko okno** działki przez `rasterio` (COG, ~0,6 s).
- Wystarcza do spadków (F7) i z grubsza do spływu. Zagłębienia (F8) na 30 m są zgrubne, więc oznaczyć w raporcie.

**Dokładnie (w tle):** NMT 1 m GUGiK
```
GET https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF
  ?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=DTM_PL-KRON86-NH_TIFF&FORMAT=image/tiff
  &SUBSET=x({xmin−300},{xmax+300})&SUBSET=y({ymin−300},{ymax+300})
```
- Współrzędne EPSG:2180 z ULDK (`geom_extent`), `x` = wschód, `y` = północ. Wynik: GeoTIFF float32, 1 m, wysokości poprawne.
- **Odpowiada 60–117 s niezależnie od wielkości obszaru** → osobne zadanie w tle; wynik do cache per działka. Po pobraniu przeliczyć F7/F7b/F8 i odświeżyć mapę („dokładny model terenu gotowy”).
- Przed demem jury rozgrzać cache dla działek pokazowych (T12.7). Sposób liczenia się nie zmienia.

### A8. BDOT10k – rowy, rzeki, wody (P8)

1. Adres paczki powiatu: `https://opendata.geoportal.gov.pl/bdot10k/schemat2021/{TERYT_woj}/{TERYT_powiatu}_GML.zip` (TERYT z ULDK: `041005_5…` → woj. `04`, powiat `0410`).
   Pełna lista z datami aktualizacji: WFS `https://mapy.geoportal.gov.pl/wss/service/PZGIK/BDOT/WFS/PobieranieBDOT10k?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:BDOT10k_powiaty` (pola `TERYT`, `URL_GML`, `Data_aktualizacji`).
2. **Nie pobierać całego ZIP-a (~50 MB, 22 s).** Serwer obsługuje HTTP Range → `remotezip` pobiera tylko 4 pliki (~2 MB łącznie, 1–2 s):
   - `…__OT_SWRM_L.xml` – **rowy melioracyjne**
   - `…__OT_SWRS_L.xml` – rzeki i strumienie
   - `…__OT_SWKN_L.xml` – kanały
   - `…__OT_PTWP_A.xml` – wody powierzchniowe (poligony)
3. Parsowanie GML: `gml:posList` w EPSG:2180. **Sprawdzić kolejność osi** (północ‑wschód vs wschód‑północ) na pierwszym pliku, porównując z bbox z ULDK.
4. Wynik F9: najbliższy obiekt każdego typu, odległość od granicy działki, punkt najbliżej działki (do pinezki zastawki). Cache per powiat (dane stałe).
5. Działka przy granicy powiatu: pobrać też sąsiedni powiat, jeśli bufor 500 m wychodzi poza niego.
6. **OSM Overpass – nie używać** do rowów: w teście 20 s i brak rowów.

### A9. Planetary Computer – Sentinel-2, Landsat, MODIS (P10)

```
POST https://planetarycomputer.microsoft.com/api/stac/v1/search
{ "collections": ["sentinel-2-l2a"],            // albo "landsat-c2-l2", "modis-13Q1-061"
  "intersects": <poligon działki GeoJSON>,
  "datetime": "{rok}-{okno_od}/{rok}-{okno_do}",  // okno wrażliwości uprawy, ≤ D
  "query": {"eo:cloud_cover": {"lt": 40}} }
Token:  GET https://planetarycomputer.microsoft.com/api/sas/v1/token/{kolekcja} → {"token": …}
URL pliku = assets.{pasmo}.href + "?" + token
```

- Bez konta. Token ważny ok. godzinę → trzymać w pamięci per kolekcja. Biblioteka `planetary-computer` robi to sama (`sign_inplace`).
- **Który sensor dla którego roku** (sprawdzone liczby scen V–VIII, chmury < 40%):

| Lata | Kolekcja | Sceny/lato | Pasma |
|---|---|---|---|
| 2016+ | `sentinel-2-l2a` | 10 (2016–17), 17–25 (2018+) | `B04`, `B08`, `B8A`, `B11`, `SCL` |
| 2006–2016 | `landsat-c2-l2` | 5–9 (2012 tylko Landsat 7) | `red`, `nir08`, `swir16`, `qa_pixel` |
| zawsze (tło 250 m) | `modis-13Q1-061` | ~17 kompozytów | `250m_16_days_NDVI` |

- Czytać **tylko okno działki** z COG (`rasterio.open(url)` + `window` w układzie kafla, zwykle UTM 33/34N). Nie pobierać całych scen.
- Maski: S2 – zostawić `SCL` ∈ {4, 5}; Landsat – bity chmury/cienia z `qa_pixel`, pasy bez danych (Landsat 7 SLC‑off) jako brak.
- Skala Landsat C2 L2: `reflektancja = DN × 0.0000275 − 0.2`. Sentinel‑2: `DN / 10000`, a dla scen z baseline ≥ 04.00 najpierw odjąć offset 1000.
- NDMI: S2 `(B8A − B11)/(B8A + B11)`; Landsat `(nir08 − swir16)/(nir08 + swir16)`. **Anomalie liczyć w obrębie jednego sensora.**
- Budżet czasu: maks. 3 sceny na sezon × 10 sezonów, 8 odczytów równolegle → ~10 s. Wyniki per (działka, scena) do cache.
- Earth Search **tylko pomocniczo**: Sentinel‑2 2016 = 0 scen, Landsat w płatnym buckecie AWS.

### A10. ARiMR GSA – uprawy (P11)

**Lata 2025, 2026 – WFS na żywo (0,2 s):**
```
GET https://geoportal-w2.arimr.gov.pl/geoserver/gsa_public/uprawy_{rok}/wfs
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=gsa_public:uprawy_rolne_{rok}
  &OUTPUTFORMAT=application/json&COUNT=50
  &BBOX={lat_min},{lon_min},{lat_max},{lon_max},urn:ogc:def:crs:EPSG::4326
→ features[].properties: roslina, roslina_skrocona, grupa_roslin, gr_upraw, pow  (+ geometria)
```
- Działa też z BBOX w EPSG:2180: `{xmin},{ymin},{xmax},{ymax},EPSG:2180`.
- Wybór uprawy: przeciąć geometrie z poligonem działki → uprawa o **największej wspólnej powierzchni**. Kilka upraw w działce → pokazać główną + „na części działki: …”.
- Inne warstwy w tej samej usłudze: `uprawy_na_gruntach_ornych_{rok}`, `uprawy_tuz_{rok}` (trwałe użytki zielone).
- Nowy rok (np. 2027) → spróbować `uprawy_{rok}`; 404 → spaść do poprzedniego roku z adnotacją.

**Lata 2020–2024 – shapefile (przetworzyć wcześniej):**
- Katalog: `GET https://geoportal.arimr.gov.pl/mapy/sharing/rest/search?q=title:"Deklaracje rolne {rok} - uprawy (GSA)"&f=json&num=100` → `id` per województwo.
- Plik: `GET https://geoportal.arimr.gov.pl/mapy/sharing/rest/content/items/{id}/data` (ZIP ~88 MB na województwo i rok, np. `2023_uprawy_woj_04_akt_public.zip`).
- Skrypt jednorazowy: 16 województw × 5 lat → jeden GeoParquet / GeoPackage z indeksem przestrzennym, tylko kolumny `rok, roslina, grupa_roslin, geometria`. Data pobrania do README (wymóg 4.2 pkt 5).

**Lata 2018 i 2022 – JRC EU Crop Map (raster 10 m):** `https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/EUCROPMAP/{2018|2022}/` → pobrać kafle dla Polski raz, dominanta klasy w działce, mapowanie klas JRC → wiersze CSV.

**Lata 2016, 2017, 2019 (i 2006–2015 dla starych dat):** brak gotowej mapy → ML1 (T4.11); bez ML1 przyjmujemy uprawę wybraną dla `D` z adnotacją. Z kontem CDSE lata 2017–2024 pokrywa też Copernicus Crop Types (USLUGI_Z_KONTEM.md).

**Przepływ w UI (T4.10):** podpowiedź z ARiMR + „Zmień” → brak podpowiedzi = kafelki → wybór rolnika zawsze wygrywa.

### A11. EDO – tło suszy (P12, opcjonalnie)

- `GET https://drought.emergency.copernicus.eu/api/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=cdiad&STYLES=&CRS=EPSG:4326&BBOX={lat-0.15},{lon-0.15},{lat+0.15},{lon+0.15}&WIDTH=64&HEIGHT=64&FORMAT=image/png&TIME={dekada}`
- `TIME` = najbliższa dekada ≤ `D` (dni 1, 11, 21). CDI od 2012, `smang` od 1995.
- Wynik to **obrazek**: odczytać kolor środkowego piksela i zamienić na klasę z `GetLegendGraphic`. GetFeatureInfo nie działa.
- Tylko porównanie w „Skąd wiemy” i 4. sygnał pewności – nigdy warunek reguły.

### A12. IMGW – rzeki i stacje (P13, opcjonalnie)

- Bieżące stany rzek: `GET https://danepubliczne.imgw.pl/api/data/hydro/` (2,4 s, ~0,5 MB) → najbliższy wodowskaz po `lon/lat`, `stan_wody` vs `stan_ostrzegawczy`. Tylko dla `D` = dziś.
- Archiwum dobowe (walidacja KBW „jak IUNG”, backtest T12.4): `https://danepubliczne.imgw.pl/data/dane_pomiarowo_obserwacyjne/dane_meteorologiczne/dobowe/synop/{rok}/` – ZIP per rok/stacja, od 1966.
- Atrybucja: „Źródłem pochodzenia danych jest Instytut Meteorologii i Gospodarki Wodnej – Państwowy Instytut Badawczy”.

### A13. Czego nie używamy (i dlaczego)

| Źródło | Powód |
|---|---|
| OSM Overpass (rowy) | brak rowów w danych, 20 s, przeciążany serwer |
| Earth Search – Landsat | pliki w płatnym buckecie AWS (requester pays) |
| Earth Search – Sentinel‑2 jako główne | lato 2016: 0 scen, 2017: 4; kolekcja `c1` ma dziury (2017, 2022) |
| IUNG GAEC2 | zastąpione kodem 5 w A4 |
| Sentinel Hub Statistical API, CLMS Soil Moisture | wymagają konta; Planetary Computer i Open‑Meteo pokrywają te potrzeby |
| Copernicus Crop Types (bez konta) | strona produktu 404; dane 2017–2024 są w katalogu CDSE, ale pobranie wymaga konta → USLUGI_Z_KONTEM.md; bez konta zastępuje JRC + ARiMR + ML1 |
