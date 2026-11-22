# Pipeline – plan działania

Jak aplikacja zamienia **działkę + dzień** w raport z zaleceniami. Dokument dla zespołu: co pobieramy skąd,
co z tego liczymy, które reguły kiedy się uruchamiają.

> Szczegóły źródeł i endpointów: [ZRODLA_DANYCH.md](ZRODLA_DANYCH.md). Uzasadnienie naukowe metod: [METODY.md](METODY.md).
> Liczby w przykładach (−214 mm, 24%, 15 m…) są **ilustracyjne**. Jedynym prawdziwym punktem odniesienia są progi
> z [dane/kbw_progi_iung.csv](dane/kbw_progi_iung.csv).
> Progi oznaczone ⚙️ to wartości startowe do kalibracji z mentorami.

---

## 0. Zasada

```
DANE (API)  →  FAKTY o działce  →  DIAGNOZA (stan + przyczyny)  →  REGUŁY „jeśli… to…”  →  ZALECENIA  →  RAPORT
```

- **Patrzymy w przód.** Przeszłość nie jest wynikiem, tylko materiałem do prognozy: każdy z N poprzednich sezonów
  (10 albo 30, zob. etap 3b) to jeden możliwy scenariusz najbliższych tygodni i kolejnego sezonu (etap 3b). Raport odpowiada na pytania
  „co mnie czeka?” i „co zrobić, żeby było lepiej?”. Bieżący stan i historia są tylko punktem startu.
- Zaleceń nie generuje AI i nie są gotowymi tekstami. Stała jest tylko **lista reguł i szablonów zdań**.
  To, **czy** zalecenie się pojawi, oraz **gdzie, kiedy i ile**, wynika z faktów policzonych dla tej działki i tej daty.
- Każde zalecenie przenosi fakty, które je uruchomiły. To jest uzasadnienie („bo…”) i źródła w raporcie.
- Bez faktów nie ma zaleceń: jeśli fakt jest niedostępny, reguła się nie uruchamia, a raport mówi, czego zabrakło.

---

## 1. Wejście

| Pole | Skąd | Uwagi |
|---|---|---|
| Działka | identyfikator EGiB **albo** gmina + obręb + numer **albo** klik na mapie | jedyne obowiązkowe pole |
| Data analizy `D` | domyślnie dziś; dowolna z ostatnich 10 lat | wszystkie dane ucinamy do `D` |
| Uprawa | **podpowiedź z deklaracji ARiMR** (etap 3, F0); gdy jej brak – rolnik wybiera | rolnik zawsze może zamienić podpowiedź |

---

## 2. Etap 1 – lokalizacja działki

| Krok | Zapytanie | Wynik |
|---|---|---|
| Po identyfikatorze | `https://uldk.gugik.gov.pl/?request=GetParcelById&id={ID}&result=geom_wkt,teryt,voivodeship,commune,region,parcel&srid=4326` | geometria WKT, TERYT, gmina, obręb |
| Po kliknięciu | `…?request=GetParcelByXY&xy={lon},{lat},4326&result=id,geom_wkt&srid=4326` | jw. |
| Po gminie/obrębie/numerze | `…?request=GetParcelByIdOrNr&id={obręb} {numer}&result=…` | jw. |

Z geometrii liczymy: centroid (lat/lon do API punktowych), bbox, bufor 500 m (teren, rowy), bufor −10 m (statystyki satelitarne), powierzchnię.

**Brak działki w ULDK** (np. podzielona po dacie `D`): komunikat „nie ma działki o tym numerze w obecnej ewidencji – wskaż ją na mapie” i dalej na geometrii z kliknięcia.

---

## 3. Etap 2 – pobieranie danych (równolegle)

Okno historii: `[D − 10 lat, D]`. Dla SPEI dodatkowo 30 lat przed `D`.

| # | Dane | Źródło / endpoint | Zakres czasu | Fallback |
|---|---|---|---|---|
| P1 | opad, ET0 (FAO‑56), Tmax, Tmin – dobowo | Open‑Meteo Archive `archive-api.open-meteo.com/v1/archive?latitude=…&longitude=…&start_date=…&end_date=D&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min` | 10 lat przed `D` + rok na rozruch bilansu (zmiana 22.11.2026: 30 lat przekraczało darmowy limit Open‑Meteo, HTTP 429) | stacje IMGW (archiwum dobowe) |
| P2 | wilgotność gleby 0–7 / 7–28 / 28–100 cm | Open‑Meteo Archive `daily=soil_moisture_0_to_7cm_mean,soil_moisture_7_to_28cm_mean,soil_moisture_28_to_100cm_mean` (dobowe – 0,6 s; godzinowe 4 s) | 10 lat | brak → bez tego wskaźnika |
| P3 | prognoza 16 dni (opad, ET0); reguły używają 7 dni (F11) | Open‑Meteo Forecast `api.open-meteo.com/v1/forecast` | tylko gdy `D` = dziś | dla dat archiwalnych **klimatologia** (średnie z 10 lat dla kolejnych 7 dni) |
| P4 | kategoria podatności gleby I–IV **+ pokrycie terenu** | IUNG WMS `sgeo.iung.pl/geoserver/Susza/wms`, warstwa `Susza:katgl_landuse2024`, GetFeatureInfo w 5–9 punktach działki → dominanta. Kody: 1–4 kategorie, **5 gleby organiczne**, 11 las, 12 woda, 13 zabudowa, 14 drogi/nieużytki, 19/99 niesklasyfikowane | stała | SoilGrids → kategoria z uziarnienia |
| P5 | piasek, ił, węgiel, θ przy FC i WP | SoilGrids `rest.isric.org/soilgrids/v2.0/properties/query` (`sand, clay, soc, wv0033, wv1500`) – **tylko 1–2 głębokości** (pełne zapytanie trwa 10–14 s) | stała | tabela typowych wartości dla kategorii IUNG |
| P6 | progi suszy KBW | [dane/kbw_progi_iung.csv](dane/kbw_progi_iung.csv) (z susza.iung.pulawy.pl/progi) | stała | – |
| P7 | model terenu | **na start: Copernicus DEM 30 m** (COG, Earth Search `cop-dem-glo-30`, odczyt 0,6 s); **dokładnie: NMT 1 m GUGiK** WCS `mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF`, CoverageId `DTM_PL-KRON86-NH_TIFF`, `SUBSET=x(…)&SUBSET=y(…)` w EPSG:2180 – **odpowiada 60–117 s**, więc pobierany w tle / cache | stała (stan obecny) | – |
| P8 | rowy, cieki, zbiorniki | **BDOT10k**: paczka GML powiatu `https://opendata.geoportal.gov.pl/bdot10k/schemat2021/{woj}/{teryt_powiatu}_GML.zip` – przez HTTP Range (`remotezip`) pobieramy **tylko** pliki `OT_SWRM_L` (rowy melioracyjne), `OT_SWRS_L` (rzeki), `OT_SWKN_L` (kanały), `OT_PTWP_A` (wody): ~2 MB, 1–2 s zamiast 54 MB / 22 s; cache per powiat | stan obecny | – (OSM Overpass nie ma rowów – nie używać) |
| P9 | gleby organiczne / mokradła | kod 5 z P4 (IUNG) | stała | – |
| P10 | zdjęcia satelitarne – wilgotność roślin (NDMI), NDVI | **Planetary Computer** STAC `planetarycomputer.microsoft.com/api/stac/v1`: `sentinel-2-l2a` (2016+, 10–25 scen/lato), `landsat-c2-l2` (2006–2016), `modis-13Q1-061` (tło); URL podpisywane tokenem `…/api/sas/v1/token/{kolekcja}`; maska chmur. Earth Search tylko pomocniczo (S2 2016: 0 scen, Landsat płatny transfer) | okna wrażliwości uprawy, 10 sezonów | Sentinel Hub Statistical API (konto) / MODIS 250 m |
| P11 | uprawa (bieżąca i historyczna) | **ARiMR GSA WFS** 2025–2026: `https://geoportal-w2.arimr.gov.pl/geoserver/gsa_public/uprawy_{rok}/wfs`, warstwa `gsa_public:uprawy_rolne_{rok}`, BBOX działki → `roslina`, `grupa_roslin`, `pow` (0,2 s). **2020–2024**: shapefile per województwo z geoportal.arimr.gov.pl → przetworzone wcześniej. **2018, 2022**: JRC EU Crop Map (`jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/EUCROPMAP/`) | 2018, 2020–2026 | lata bez danych → klasyfikacja z serii zdjęć (ML1, METODY.md §8) [+]; bez ML1 dla roku `D` rolnik wybiera z kafelków |
| P12 | tło suszy (porównanie) | EDO WMS `drought.emergency.copernicus.eu/api/wms` (`cdiad`, `smang`), GetMap z `TIME` – zwraca obrazek, wartość z koloru legendy | CDI 2012+, SMA 1995+ | pominąć |
| P13 | stan rzek (kontekst hydrologiczny) | IMGW `danepubliczne.imgw.pl/api/data/hydro/` (bieżące) / archiwum dobowe | – | pominąć |

---

## 4. Etap 3 – fakty o działce

| Fakt | Jak liczony | Dane | Przykład |
|---|---|---|---|
| **F0 uprawa** | ARiMR GSA dla roku `D` (uprawa o największej wspólnej powierzchni z działką) → **podpowiedź** w UI; rolnik może ją zamienić; brak danych dla roku `D` (2016, 2017, 2019, brak deklaracji, błąd usługi) → rolnik wybiera z kafelków. Wybór rolnika zawsze wygrywa; raport podaje źródło („deklaracja ARiMR {rok}” / „wybrane przez rolnika”) | P11 | owies (wg ARiMR 2025) |
| **F0h uprawy historyczne** | ARiMR 2020–2026, JRC 2018/2022; lata bez danych (2016, 2017, 2019, a dla starych dat też 2006–2015) → klasyfikacja ML1 z serii zdjęć (P10) z pewnością klasy; bez ML1 → uprawa z F0 + adnotacja | P11, P10 | 2025 owies, 2026 jęczmień ozimy… |
| **F13 tryb daty** | `sezon`, jeśli 21.III ≤ D ≤ 30.IX, w przeciwnym razie `poza sezonem` | D | sezon |
| **F6 kategoria gleby** | dominanta kategorii IUNG w punktach działki | P4 | II |
| **F6b pojemność wodna TAW (mm)** | `(θFC − θWP) × głębokość korzeni` (SoilGrids) albo WOD z kategorii IUNG (I: 110, II: 150, III: 185, IV: 220 mm ⚙️) | P4, P5 | 150 mm |
| **F6c węgiel organiczny** | SoilGrids `soc` 0–30 cm | P5 | 0,9% |
| **F1 bilans 60 dni (KBW)** | `Σ opad − Σ ET0` w **ostatnim pełnym okresie 6‑dekadowym** kończącym się ≤ D (okresy: 21.III–20.V, 1.IV–31.V, … 1.VIII–30.IX) | P1 | −214 mm |
| **F2 próg suszy** | odczyt z CSV: (F0, F6, okres z F1) | P6 | −188 mm |
| **F3 susza teraz** | `F1 < F2` | F1, F2 | tak |
| **F4 zapas wody w glebie (%)** | bilans dobowy FAO‑56 od 1.III (start: gleba pełna): `Dr = Dr − opad_eff + ET0 × Kc(faza)`, ograniczone do [0, TAW]; `zapas = 1 − Dr/TAW` | P1, F0, F6b | 24% |
| **F4p próg stresu** | `1 − p` (p z FAO‑56 dla uprawy, np. kukurydza 0,55) | F0 | 45% |
| **F5 częstość suszy** | dla każdego z 10 sezonów: czy w którymkolwiek okresie KBW < próg (dla **uprawy z tego roku**, F0h); liczba lat + miesiące z największą liczbą przekroczeń | P1, P6, F0h | 5 z 10, VI–VII |
| **F5s potrzeba wody w sezonie** | dla każdego z 10 lat: `Σ(ET0×Kc − opad_eff)` w oknie wrażliwości uprawy → mediana i 80. percentyl | P1, F0 | 60 / 110 mm |
| **F14 opad vs norma** | opad 60 dni / średnia z tych samych dni w 10 latach (wcześniej 30 — patrz P1); SPI/SPEI‑2 | P1 | 53%, SPEI −1,7 |
| **F15 upał** | liczba dni z Tmax > 30°C w 30 dniach przed D; ET0 60 dni vs norma | P1 | 9 dni |
| **F7 spadek** | spadek z NMT; maksymalny i średni w działce, mapa stref > 3% | P7 | maks. 7% (wschód) |
| **F7b spływ** | kierunki i akumulacja spływu (D8); punkty, w których spływ wychodzi poza działkę; udział odpływu metodą SCS‑CN (λ = 0,05, zob. METODY.md §2) dla dni z opadem > 10 mm | P7, F6 | 18% |
| **F8 zagłębienia** | wypełnianie zagłębień (DEM_filled − DEM > 0,1 m ⚙️) w działce + buforze 50 m; powierzchnia, objętość | P7 | NE róg, 0,15 ha, ~300 m³ |
| **F9 rów / ciek** | najbliższy obiekt hydrograficzny: odległość od granicy działki, typ (rów/rzeka/zbiornik) | P8 | rów 15 m |
| **F9b gleba organiczna** | udział punktów z kodem 5 (gleby organiczne) w odczycie IUNG | P4 / P9 | nie |
| **F10 najsuchsza strefa** | NDMI w działce z ostatniej czystej sceny ≤ D w oknie uprawy, z‑score względem tych samych tygodni w latach okna (ten sam sensor); piksele z z < −1 ⚙️ → poligon | P10 | wschód, 1,6 ha |
| **F10b reakcja roślin** | mediana z‑score NDMI w działce | P10 | −1,6 |
| **F11 deszcz w prognozie** | Σ opad efektywny 7 dni (P3 albo klimatologia) | P3 | 3 mm |
| **F12 faza uprawy** | kalendarz uprawy (tabela FAO‑56 dopasowana do PL) + D → faza + czy okno wrażliwe | F0, D | kwitnienie, wrażliwe |
| **F16 tło europejskie** | wartość EDO CDI / SMA dla D (porównanie, nie wejście reguł) | P12 | „ostrzeżenie” |

---

## 4b. Etap 3b – prognoza: co czeka działkę (scenariusze z poprzednich sezonów)

**Pomysł:** nie wiemy, jaka będzie pogoda, ale znamy poprzednie sezony w tym miejscu. Puszczamy bilans wody w glebie
(ten sam model co F4) **od dzisiejszego zapasu** przez pogodę każdego z tych lat. Dostajemy N możliwych przebiegów.
Metoda: Ensemble Streamflow Prediction (Day, 1985), stosowana w prognozach hydrologicznych. Start od bieżącego stanu
jest uzasadniony tym, że w pierwszym miesiącu o trafności decyduje głównie zapas początkowy (Shukla & Lettenmaier, 2011).

**N = 10 albo 30** (30 lat i tak pobieramy dla SPEI). Wybór rozstrzyga hindcast (METODY.md §7, analiza B). Progi niżej
są **udziałami przebiegów**; przykłady „x/10” dotyczą N = 10. Historyczna podatność (F5) zostaje na 10 latach.

```
zapas dziś (F4) ──► pierwsze 7–16 dni: prognoza Open‑Meteo (gdy D = dziś)
                └─► dalej: pogoda N poprzednich sezonów (te same dni roku) ──► N przebiegów zapasu wody
```

| Fakt | Jak liczony | Przykład |
|---|---|---|
| **F17 przebiegi zapasu** | N trajektorii F4 od D do końca kolejnego sezonu (poza sezonem: od D przez zimę do 30.IX następnego roku) | – |
| **F18 ryzyko stresu w czasie** | dla każdego tygodnia/miesiąca: w ilu z N przebiegów zapas < F4p (dla uprawy F0, a poza sezonem dla przewidywanej uprawy – płodozmian z F0h lub ta sama) | 14 dni: 9/10; VII 2027: 5/10 |
| **F18d dzień przekroczenia** | mediana dnia, w którym zapas spadnie poniżej F4p | za ~5 dni |
| **F19 przewidywany brak wody** | Σ(ETc − opad_eff) w oknie wrażliwości w każdym przebiegu → mediana i 80. percentyl | 60 / 110 mm |
| **F20 efekt działania** | te same N przebiegów z parametrem zmienionym przez działanie (tabela niżej) → różnica dni stresu, ryzyka i braku wody | resztki: −6 dni stresu w 7/10 |
| **F21 ryzyko z planem** | F18 z wszystkimi zaleceniami naraz | VII: 5/10 → 2/10 |

Jak działanie zmienia model (F20) ⚙️:

| Działanie | Zmiana w modelu | Źródło założenia |
|---|---|---|
| resztki / mulcz | parowanie z gleby (Ke·ET0) −5% na każde 10% okrycia; typowo 30–60% okrycia → −15–30%; Kcb bez zmian | FAO‑56, mulcze (podejście Kcb + Ke) |
| międzyplon | mniejszy odpływ z ulew (CN −3) **oraz** zużycie wody: wiosenny start bilansu niższy o ok. 20–30 mm ⚙️, gdy międzyplon rósł do wiosny | NRCS; Meyer i in. 2019 (średnio −27 mm przesiąkania) |
| więcej materii organicznej | w horyzoncie scenariuszy TAW bez zmian; osobno „perspektywa wieloletnia”: TAW + 1,16 mm na 10 cm strefy korzeniowej na każdy +1 pp. SOC (więcej na piaskach) | KOWR „Podstawy naukowe” s. 2; Minasny & McBratney 2018 |
| pas buforowy, uprawa w poprzek stoku | odpływ z ulew (SCS‑CN) −30–50% na strefie stoku ⚙️ (zakres do sprawdzenia, analiza E) | NWRM, NRCS |
| zagłębienie / oczko | zapas wody {objętość} m³ dostępny do nawadniania w oknie wrażliwym | F8 |
| zastawka na rowie | wiosenny start bilansu: gleba pełna + wolniejsze odwadnianie; szacunek objętości z powierzchni zlewni rowu × nadwyżka zimowa × 0,1 ⚙️ (zgrubny, opisany jako szacunek) | NWRM |
| nawadnianie | dawka dodana w dniu przekroczenia F4p | FAO‑56 |

---

## 5. Etap 4 – diagnoza

### 5.1 Stan i perspektywa (górny pasek raportu)

Najpierw **co nas czeka** (F18), potem krótko stan bieżący jako punkt startu.

| Warunek | Etykieta | Zdanie |
|---|---|---|
| tryb `sezon`, F18 (14 dni) ≥ 70% przebiegów (7/10) ⚙️ | **Susza nadchodzi / trwa** | „Za ok. {F18d} dni zapas wody spadnie poniżej progu stresu (w {F18}/{N} scenariuszy). Dziś: {F4}%.” |
| tryb `sezon`, F18 (14 dni) 30–69% (3–6/10) ⚙️ | **Zagrożenie** | „W najbliższych 2 tygodniach możliwy stres wodny ({F18}/{N}). Dziś: {F4}%.” |
| tryb `sezon`, F18 (14 dni) < 30% (≤ 2/10) ⚙️ | **Spokojnie** | „Wody wystarczy na najbliższe tygodnie.” |
| tryb `poza sezonem` | **Plan na sezon {rok+1}** | „W {F18 max}/{N} scenariuszy {uprawa} wejdzie w stres w {miesiące}. Z planem: {F21}/{N}.” |
| brak progu IUNG dla uprawy (łąka, burak kat. I) | jw. | dopisek „brak urzędowego progu suszy dla tej uprawy — oceniamy z bilansu gleby” |
| działka nierolnicza (kody IUNG 11–14 z P4: las, woda, zabudowa, drogi) | **Poza zakresem** | „To nie jest grunt rolny — ocena rolnicza niedostępna” |

Progi 70% / 30% sprawdzamy hindcastem (METODY.md §7, analiza B): „7/10” powinno się spełniać w ok. 70% przypadków.

Kryterium IUNG (F3) i częstość suszy w przeszłości (F5) pokazujemy jako **uzasadnienie** pod spodem
(wymóg 3.3 pkt 4: ocena bieżąca + historyczna podatność), a nie jako nagłówek.

**Pewność** = liczba zgodnych sygnałów z 4: (F3 lub F14 < 70%), (F4 < F4p), (F10b < −1), (F16 ostrzeżenie/alarm).
4 = wysoka, 3 = średnia, ≤ 2 = niska. Brak sygnału (brak danych) obniża pewność i jest wymieniony z nazwy.

### 5.2 Przyczyny (sekcja „Co zwiększa ryzyko na tej działce”)

Każda przyczyna ma ocenę 0–3. W raporcie pokazujemy te z oceną ≥ 1 jako „główna” (najwyższa), „duża” (≥ 2) albo „mała” (1).
Dzielimy je na **pogodowe** (C1, C2 – nie masz wpływu) i **stałe cechy działki** (C3–C5 – na nie działają zalecenia).
To pokazuje, po co jest każde działanie.

| # | Przyczyna | Warunek uruchomienia ⚙️ | Ocena 0–3 |
|---|---|---|---|
| C1 | Mało deszczu | F14 < 70% normy **lub** SPI‑2 < −1 | < 70% → 1, < 55% → 2, < 40% → 3 |
| C2 | Upał / duże parowanie | F15 ≥ 5 dni > 30°C **lub** ET0 60 dni > 115% normy | 5 dni → 1, 8 → 2, 12 → 3 |
| C3 | Lekka gleba | F6 = I lub II **lub** TAW < 130 mm | II → 2, I → 3 |
| C4 | Woda spływa z pola | maks. F7 > 3% **lub** F7b > 10% | 3% → 1, 5% → 2, 8% → 3 |
| C5 | Rów odprowadza wodę | F9 ≤ 100 m i typ = rów | ≤ 100 m → 1, ≤ 30 m → 2, + gleba organiczna → 3 |
| C6 | Niedobór trafił w krytyczną fazę uprawy | F3/F4 < F4p w oknie wrażliwym (F12) | tak → 2 |

---

## 6. Etap 5 – reguły zaleceń

Kolejność w raporcie zawsze: **retencja (R1–R4) → pole (R5–R6) → nawadnianie (R7–R8)**.
Maksymalnie 6 zaleceń. Wyróżnione „PILNE / NAJLEPIEJ TERAZ” wybieramy tak: R7, jeśli się uruchomiła, w przeciwnym razie pierwsza reguła retencji z terminem „teraz”.

**Warunki patrzą w przód.** Tam, gdzie poniżej stoi `F5 ≥ 3/10` (susza w przeszłości), w kodzie używamy
**ryzyka na kolejny sezon `F18 ≥ 30%` przebiegów** – liczonego ze scenariuszy, od dzisiejszego zapasu. F5 zostaje w „bo…”
jako uzasadnienie. Każda karta zalecenia dostaje też **„Co zyskasz”** z F20 (np. „−6 dni stresu w sezonie”, „ryzyko w lipcu 5/10 → 3/10”).

| # | Zalecenie | JEŚLI ⚙️ | GDZIE | KIEDY | ILE | Szablon „bo…” | Kod |
|---|---|---|---|---|---|---|---|
| **R1** | Zastawka / piętrzenie na rowie | F9 ≤ 100 m, typ = rów **i** (F3 **lub** F5 ≥ 3/10) | punkt rowu najbliżej działki | X–III (sezon: „jesienią, przed zimą”; poza sezonem: „teraz”) | – | „Rów biegnie {F9} m od działki; w {F5} z 10 sezonów brakowało wody” | spowolnienie odpływu; zgłoszenie wodnoprawne |
| **R2** | Zatrzymanie wody w zagłębieniu (oczko, niecka) | F8: objętość ≥ 100 m³ lub pow. ≥ 0,05 ha **i** F5 ≥ 3/10 | poligon zagłębienia | po zbiorze / poza wegetacją | {objętość} m³, {pow.} ha | „Tu spływa deszcz z {udział}% pola; zmieści ok. {objętość} m³” | NWRM N01 |
| **R3** | Pas trawy / zadrzewienie | C4 ≥ 1 i istnieje punkt wypływu spływu na granicy (F7b) | odcinek granicy przy wypływie, pas 6–10 m | XI lub III (sadzenie) | {długość} m × 6–10 m | „Spadek do {F7}% — przy ulewach ok. {F7b}% deszczu ucieka” | NWRM A02 |
| **R4** | Nie odwadniać / ochrona mokradła | F9b = tak (gleba organiczna) **lub** zagłębienie z TWI w górnych 10% | poligon gleby organicznej / zagłębienia | stale | – | „Gleba organiczna — każde obniżenie wody ją niszczy” | NWRM N02 |
| **R5** | Międzyplon / resztki / okrywa | C3 ≥ 2 **lub** F6c < 1,5% | cała działka | po zbiorze uprawy F0 (z kalendarza); poza sezonem i pole po zbiorze: „zostaw resztki, nie orz na zimę”; na kat. I–II przy F18 (wiosna) ≥ 30% międzyplon niszczony wcześnie wiosną albo sam mulcz z resztek (międzyplon zużywa wodę) | – | „Gleba kat. {F6}, {F6c}% węgla — okrywa zwiększy wsiąkanie i ograniczy parowanie” (przyrost zapasu wody z próchnicy opisany jako efekt wieloletni) | NWRM A08 / A13 |
| **R6** | Uprawa w poprzek stoku / uproszczona | C4 ≥ 2 | strefy F7 > 3% | przy najbliższej uprawie | – | „Spadek {F7}% — uprawa wzdłuż stoku przyspiesza spływ” | NWRM A04 / A07 |
| **R7** | **Nawadnianie teraz** | tryb `sezon` **i** (F4 < F4p **lub** F18d ≤ 7 dni) **i** (Dr − F11) > 10 mm **i** F12 = okno wrażliwe | F10 (najsuchsza strefa); brak satelity → cała działka | do dnia, w którym prognozowany zapas spadnie o kolejne 10% (lub „w ciągu 3 dni”) | dawka = min(Dr − F11, maks. dawka: I 20 mm, II 25 mm, III 30 mm, IV 35 mm); objętość = dawka × pow. strefy | „Zapas {F4}% przy progu {F4p}%; prognoza 7 dni: {F11} mm; uprawa w fazie {F12}” | FAO‑56 |
| **R7‑** | Nie podlewaj teraz | tryb `sezon` i (F4 ≥ F4p **lub** F11 pokrywa brak) | – | – | – | „Deszcz w prognozie ({F11} mm) uzupełni brak” | – |
| **R8** | Plan nawadniania na sezon | (tryb `poza sezonem` **lub** R7 nie uruchomiona) **i** F18 (sezon) ≥ 30% | F10 z ostatniego sezonu | plan: okno wrażliwe uprawy | typowy sezon {F19 mediana} mm, suchy {F19 p80} mm; objętość × pow. | „W {F18}/{N} scenariuszy uprawa wejdzie w stres w {miesiące}; zagłębienie (R2) pokryje {x}% potrzeb” | FAO‑56 |
| **R9** | Rozważ inną uprawę / termin siewu | F5 ≥ 6/10 dla F0 **i** ta sama gleba daje ≤ 3/10 dla innej uprawy z tabeli progów | cała działka | przy planowaniu płodozmianu | – | „Na tej glebie {uprawa} przekraczała próg suszy {n}/10 razy, {inna} — {m}/10” | – |

**Gdy żadna reguła się nie uruchomi:** „Nie widzimy potrzeby działań — obserwuj stan w kolejnych tygodniach.”
**Gdy fakt jest niedostępny:** reguła, która go wymaga, nie działa, a raport wymienia ją w „Czego nie sprawdziliśmy” (np. „Brak danych o rowach w okolicy — nie oceniliśmy możliwości piętrzenia”).

---

## 7. Tryby zależne od daty

| D | Co liczymy | Które reguły mają sens |
|---|---|---|
| 21.III–30.IX | F1–F4 dla bieżącego okresu, prognoza | wszystkie; R7 możliwa |
| 21.III–20.V (brak pełnego okresu 60 dni) | F1 z niepełnego okresu + adnotacja | jw., pewność obniżona |
| 1.X–20.III | zapas na dziś (F4 z P2) → scenariusze przez zimę na **kolejny sezon** (F18–F21); miniony sezon tylko jako uzasadnienie | R1–R6 z terminem „teraz”, R8 zamiast R7 |
| data historyczna | wszystko ucięte do D; prognoza → klimatologia | jw.; R7 z dopiskiem „bez prognozy z tamtego dnia” |

---

## 8. Raport – co trafia na stronę (wymóg 3.3 pkt 5–6)

1. **Co Cię czeka** (5.1): perspektywa z F18 + zapas dziś (F4 vs F4p) + pewność.
2. **Pilne / najlepiej teraz** – jedno zalecenie.
3. **Mapa działki** z numerami zaleceń i widokami: plan / gdzie sucho (F10) / teren i spływ (F7, F7b, F8, F9) / gleba (F6).
4. **Co zrobić i gdzie** – lista R1–R9 w kolejności retencja → pole → nawadnianie; każda karta: co, gdzie, kiedy, ile, „bo…”, **„co zyskasz”** (F20).
5. **Ryzyko w kolejnych miesiącach** – F18 per miesiąc „bez działań” i „z planem” (F21) + przewidywany brak wody (F19).
6. **Co zwiększa ryzyko na tej działce** – C1–C6, rozdzielone na pogodę i stałe cechy działki.
7. Uzasadnienie (zwinięte): kryterium IUNG teraz (F3) i historyczna podatność (F5, F0h) – wymóg 3.3 pkt 4.
8. **Skąd wiemy** – źródła P1–P13 z datami pobrania, dane w stanie obecnym, braki danych, ograniczenia (m.in. „scenariusze to pogoda z poprzednich lat, nie prognoza pogody”), szczegóły liczbowe.
9. Zapis: PDF / druk / zapis w przeglądarce.

---

## 9. Zgodność z poleceniem

| Wymaganie | Gdzie w pipeline |
|---|---|
| 3.2 pkt 1 – ocena wilgotności z satelity, gleby i meteo, 10 lat, z uwzględnieniem uprawy | F0–F6, F10, F14–F15, 5.1 |
| 3.2 pkt 2 – miejsca i sposoby retencji z terenu, wód i uprawy | F7–F9b, R1–R6 |
| 3.2 pkt 3 – nawadnianie: zasadność, termin, zakres | R7, R7‑, R8 |
| „Kolejność ma znaczenie”, brak rekomendacji bez rozpoznania | reguły korzystają wyłącznie z faktów (etap 3) i diagnozy (etap 4) |
| 3.3 pkt 4 – liczone z danych bieżących i 10 lat, nie gotowe rekomendacje | wszystkie warunki, miejsca, terminy i ilości liczone per działka i data |
| 3.3 pkt 5 – stan, przyczyny, uzasadnienie, daty, źródła, ograniczenia, niepewność | 5.1, 5.2, „bo…”, sekcja 8 pkt 7 |
| 3.3 – 5 kategorii danych | meteo P1–P3, satelita P10, gleba P4–P6, hydrologia P8, P13, przestrzenne ULDK, P7, P11 |
| rozdz. 6 – dowolna działka w Polsce, dowolna data z 10 lat | etap 1 + sekcja 7 |

---

## 10. Budżet czasu (< 30 s)

| Krok | Szacunek | Uwagi |
|---|---|---|
| ULDK | < 1 s | – |
| P1–P6, P9, P12 równolegle | 2–4 s | Open‑Meteo: archiwum 10 lat + rok rozruchu |
| P7 teren | < 1 s (Copernicus DEM 30 m) | NMT 1 m z GUGiK trwa 60–117 s → w tle / cache |
| P8 rowy | 1–2 s (4 pliki z ZIP-a przez HTTP Range) | < 0,1 s z cache powiatu |
| P10 satelita, 10 sezonów | 5–15 s | Planetary Computer, okna wrażliwości, ≤ 3 sceny/sezon, ≤ 40% chmur, odczyt tylko pikseli działki z COG; wyniki per (działka, scena) w cache |
| P11 uprawa | 0,2 s (WFS 2025–2026) | 2020–2024 z wcześniej przetworzonego pliku |
| Fakty + reguły | < 1 s | – |

---

## 11. Do kalibracji z mentorami (⚙️)

- WOD dla kategorii IUNG (110/150/185/220 mm) i głębokości korzeni upraw.
- Progi przyczyn C1–C6 i ich skala 0–3.
- Minimalne zagłębienie (0,1 m, 100 m³, 0,05 ha), odległość rowu (100 m), spadek (3%).
- Maksymalne dawki nawadniania na kategorię gleby, próg z‑score NDMI dla „najsuchszej strefy”.
- Kalendarz faz i okna wrażliwości upraw dla Polski.
- Progi udziału przebiegów (70% / 30%) i liczba scenariuszy N (10 vs 30).
- Spadek wiosennego zapasu po międzyplonie (20–30 mm) i redukcja odpływu przez pas buforowy (30–50%).
- Walidacja i kalibracja: analizy A–E w METODY.md §7 (backtest vs SMSR / EDO CDI / plony GUS, hindcast scenariuszy,
  bilans glebowy vs ERA5‑Land / ESA CCI SM / ISMN, analiza wrażliwości progów, porównanie z AquaCrop).
  Ustalenia mentorów i wyniki analiz zapisujemy przy każdym ⚙️ jako źródło liczby.
