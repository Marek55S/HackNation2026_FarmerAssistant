# Źródła danych – co pobieramy i skąd

Stan na **2026‑11‑21**. Kolumna **Test** pokazuje, czy endpoint został dziś faktycznie odpytany:
✅ działa i zwraca dane, ⚠️ działa częściowo lub wymaga obejścia, ❓ niesprawdzony (adres do potwierdzenia).
Każde źródło ma priorytet: **MUST** (rdzeń prototypu), **SHOULD** (podnosi ocenę), **NICE** (jeśli starczy czasu).

Metody, w których dane są używane, opisuje [METODY.md](METODY.md).

---

## Przepływ danych dla jednej działki

```
ID działki / klik na mapie
        │
        ▼
 ULDK GUGiK ──► geometria (WKT), TERYT, gmina ──► centroid, bbox, bufor 500 m
        │
        ├─► Open‑Meteo (archiwum 10 lat + prognoza)   → P, ET0, T, wilgotność gleby  [meteo]
        ├─► IMGW (opcjonalnie, stacje)                → P, T do KBW „jak IUNG”        [meteo]
        ├─► Sentinel‑2 L2A (STAC / Sentinel Hub)      → NDVI, NDMI, VCI w działce     [satelita]
        ├─► IUNG kategoria gleby (WMS GFI)            → kat. I–IV, WOD                [gleba]
        ├─► SoilGrids (REST)                          → piasek/ił/SOC, θFC, θWP       [gleba]
        ├─► KIEG (WMS GFI)                            → użytek, klasa bonitacyjna     [gleba/przestrz.]
        ├─► NMT 1 m (WCS GUGiK)                       → spadek, zagłębienia, TWI      [przestrzenne]
        ├─► BDOT10k / OSM                             → rowy, cieki, zbiorniki        [hydro]
        ├─► IMGW hydro, PIG‑PIB                       → stany rzek, wody podziemne    [hydro]
        └─► EDO (WMS)                                 → CDI, SPI, anomalia SM – tło   [kontekst]
```

---

## 0. Okno czasowe: „10 lat wstecz” od DOWOLNEJ daty analizy ⚠️ kluczowe

Wymaganie (zadanie, rozdz. 6): jury podaje **datę analizy z ostatnich 10 lat**, a ocena ma się opierać
na **danych z 10 lat przed tą datą**. Najgorszy przypadek wygląda tak:

```
data analizy = 2016‑11‑21  →  potrzebne dane: 2006‑11‑21 … 2016‑11‑21
data analizy = 2026‑11‑21  →  potrzebne dane: 2016‑11‑21 … 2026‑11‑21
=> aplikacja musi umieć sięgnąć do ~2006 roku (+ 30 lat dla klimatologii SPI)
```

Zasada: **wszystkie zapytania mają `end = data_analizy`**. Nic z przyszłości względem daty analizy nie wchodzi
do wyniku (brak „wycieku przyszłości”). Daty liczymy względem `data_analizy`, nigdy względem „dziś”.

### Zasięg czasowy źródeł (sprawdzone 2026‑11‑21, punkt testowy 53,05°N 17,75°E)

| Źródło | Od kiedy | Pokrywa 2006–2016? | Co robimy przy starszych datach |
|---|---|---|---|
| Open‑Meteo ERA5 / ERA5‑Land (P, ET0, T, wilgotność gleby) | 1940 / 1950 | ✅ (sprawdzono 2006‑06‑01) | nic – źródło bazowe dla całego okna |
| IMGW archiwum dobowe (stacje) | dziesięciolecia | ✅ | nic |
| **Sentinel‑2 L2A – Earth Search** `sentinel-2-l2a` | nad Polską **2016‑11‑02** | ❌ | zob. drabina satelitarna niżej |
| Sentinel‑2 L2A – Earth Search `sentinel-2-c1-l2a` | nad Polską **2017‑12‑02** | ❌ | jw. |
| **Sentinel‑2 L2A – CDSE** | nad Polską **2015‑07‑11** | ⚠️ tylko od 07.2015 | jw. |
| **Landsat C2 L2 (Earth Search)** – L5 / L7 / L8 / L9, 30 m, z SWIR (NDMI) | 1982 | ✅ 2006: L5+L7; **2012: tylko L7** (pasy SLC‑off) | główne źródło satelitarne dla lat < 2017 |
| **MODIS MOD13Q1 NDVI 250 m** (Planetary Computer) | 2000‑02 | ✅ | tło i anomalia dla działek > ~5 ha lub gdy brak Landsata |
| HLS (Harmonized Landsat‑Sentinel) – Planetary Computer | 2020‑01 | ❌ | nie używać jako bazy historycznej |
| Sentinel‑1 GRD | 2014‑10 | ⚠️ | wilgotność SAR tylko od 2015 |
| CLMS Surface Soil Moisture 1 km | 2014/2015 | ⚠️ | brak → ERA5‑Land SM (pełne okno) |
| CLMS HR‑VPP (fenologia 10 m) | 2017 | ❌ | brak → krzywa NDVI z Landsat/MODIS |
| EDO `smang` (anomalia wilgotności gleby) | 1995 | ✅ | – |
| EDO `spaST` / `spaLT` (SPI ERA5) | 1991 | ✅ | – |
| EDO `cdiad` (CDI) / `fpanv` (fAPAR) | 2012‑01 | ⚠️ | dla dat < 2022 historia CDI krótsza niż 10 lat – opisać |
| EDO `rdria` (ryzyko dla rolnictwa) | 2010‑01 | ⚠️ | jw. |
| IUNG SMSR (mapy, komunikaty – walidacja) | 2008 | ✅ | – |
| Open‑Meteo Historical Forecast (archiwum prognoz) | dane od **2017** (2016‑12 = `null`) | ⚠️ | ciągły szereg analiz krótkoterminowych, **a nie** prognoza wydana w dniu analizy → dla dat historycznych nawadnianie liczymy z **klimatologii** (średnia P i ET0 na kolejne 7–14 dni z 10 lat przed datą) i mówimy o tym wprost |
| IMGW hydro (stany wód) | API: tylko bieżące; archiwum dobowe: dziesięciolecia | ✅ archiwum | dla dat historycznych tylko archiwum |
| ULDK, BDOT10k, NMT, IUNG kategorie gleb, KIEG | **stan obecny** (bez historii) | ⚠️ | używamy stanu obecnego; w raporcie: „granice, rowy i teren według stanu na dziś” |

### Drabina satelitarna (wybór sensora dla każdego roku w oknie)

```
rok ≥ 2017          → Sentinel‑2 L2A (10 m)          [Earth Search / CDSE]
2015‑07 … 2016      → Sentinel‑2 L2A z CDSE  + Landsat 7/8
2013 … 2015         → Landsat 8 (+7)       (30 m)
2006 … 2012         → Landsat 5 / 7        (30 m; 2012 tylko L7 z pasami SLC‑off → maska)
zawsze, jako tło    → MODIS 250 m (2000+) – spójny szereg dla anomalii
```

Konsekwencje metodyczne (opisane w [METODY.md](METODY.md) §1.5):
- **Anomalie liczymy osobno dla każdego sensora** (z‑score względem lat z tym samym sensorem) albo na MODIS, który
  daje jednolity szereg. Bezwzględnych wartości NDVI z S2 i Landsata nie porównujemy bez korekty.
- **Mała działka (< ~1 ha) + Landsat 30 m** = kilka pikseli → pewność „niska” i komunikat w raporcie.
- **Klimatologia SPI/SPEI:** 30 lat **poprzedzających** datę analizy (ERA5), a nie stałe 1991–2020. Dzięki temu
  dla daty z 2017 r. nie używamy lat 2018–2020.
- **Uprawa:** rolnik podaje uprawę na bieżący sezon. W latach wcześniejszych mogła być inna, więc historyczną
  podatność liczymy „jak gdyby rosła ta uprawa” (progi IUNG dla wybranej uprawy) i mówimy o tym w ograniczeniach.

---

## 1. Dane przestrzenne – działka, teren, użytkowanie

| Źródło | Co daje | Endpoint / przykład | Dostęp | Test | Priorytet |
|---|---|---|---|---|---|
| **ULDK GUGiK** | geometria działki po ID lub po punkcie, TERYT, gmina, obręb | `https://uldk.gugik.gov.pl/?request=GetParcelById&id=046101_1.0098.225/18&result=geom_wkt,teryt,commune&srid=4326`<br>`…?request=GetParcelByXY&xy=18.0,53.12,4326&result=id,geom_wkt&srid=4326` | bez klucza, bezpłatne | ✅ | **MUST** |
| **KIEG – Krajowa Integracja Ewidencji Gruntów (WMS)** | podgląd działek, **użytki i kontury klasyfikacyjne** (klasa bonitacyjna, np. RIVa) przez GetFeatureInfo | `https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow` – warstwy `dzialki`, `numery_dzialek`, `uzytki`, `kontury`, `obreby` | bezpłatne | ⚠️ działa, ale pola użytku i konturu bywają **puste** – zależy od starostwa | SHOULD |
| **EGiB – eksport działek (Parquet)** | wszystkie działki w Polsce (offline) | `https://opendata.geoportal.gov.pl/InneDane/latest_exports/eziudp_wfs/PARQUET/0_dzialki.parquet` | bezpłatne | ✅ **4,6 GB**, aktualizacja codzienna – nie pobierać w locie; ewentualnie jako zapasowy indeks offline | NICE |
| **NMT 1 m – GUGiK WCS** | numeryczny model terenu (spadek, zagłębienia, spływ, TWI) | `https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF` – CoverageId `DTM_PL-KRON86-NH_TIFF`, układ EPSG:2180, `GetCoverage` z `subset` na bbox | bezpłatne | ✅ GetCapabilities | **MUST** |
| Copernicus DEM GLO‑30 (Earth Search) | zapasowy DEM 30 m, gdy WCS GUGiK nie odpowiada | kolekcja `cop-dem-glo-30` w `https://earth-search.aws.element84.com/v1` | bez konta | ✅ | NICE (fallback) |
| **BDOT10k** | rzeki, rowy, kanały (`SWRS`, `SWKN`), wody powierzchniowe (`PTWP`), zadrzewienia (`PTLZ`), roślinność | WFS `https://mapy.geoportal.gov.pl/wss/service/PZGIK/BDOT/WFS/PobieranieBDOT10k` – **udostępnia paczki per powiat** (GML/ZIP), nie obiekty w locie | bezpłatne, dowolny cel | ⚠️ WFS zwraca tylko `BDOT10k_powiaty` → pobrać paczkę powiatu lub użyć WMS / OSM | SHOULD |
| OpenStreetMap (Overpass API) | `waterway=ditch/drain/stream/river`, `natural=water/wetland`, zadrzewienia | `https://overpass-api.de/api/interpreter` | ODbL (atrybucja) | ⚠️ działa, ale publiczny serwer był dziś **przeciążony (502)** – tylko z retry/cache lub z własnej instancji | NICE (fallback) |
| Mapa glebowo‑rolnicza (WMS) | kompleksy przydatności rolniczej, podgląd | `https://mapy.geoportal.gov.pl/wss/service/pub/guest/MapaGlebowoRolnicza/MapServer/WMSServer` | podgląd bezpłatny (pełne dane wektorowe w PZGiK) | ✅ GetCapabilities | NICE |
| CORINE Land Cover / ESA WorldCover 10 m | pokrycie terenu wokół działki (las, łąki, zabudowa – kontekst retencji) | CLMS / `https://esa-worldcover.org` (COG na AWS) | CC BY 4.0 | ❓ | NICE |

---

## 2. Dane meteorologiczne

| Źródło | Co daje | Endpoint / przykład | Dostęp | Test | Priorytet |
|---|---|---|---|---|---|
| **Open‑Meteo Historical (ERA5‑Land)** | dobowe: `precipitation_sum`, **`et0_fao_evapotranspiration`**, `temperature_2m_max/min`; godzinowe: `soil_moisture_0_to_7cm`, `_7_to_28cm`, `_28_to_100cm`. Od 1950, ~9 km | `https://archive-api.open-meteo.com/v1/archive?latitude=53.05&longitude=17.75&start_date=2016-01-01&end_date=2026-11-21&daily=precipitation_sum,et0_fao_evapotranspiration,temperature_2m_max,temperature_2m_min&timezone=Europe/Warsaw` | bez klucza; CC BY 4.0; darmowy limit **niekomercyjny** (~10 000 zapytań/dzień) | ✅ (ET0 i SM potwierdzone) | **MUST** |
| **Open‑Meteo Forecast** | prognoza 7–16 dni: opad, ET0 → planowanie nawadniania | `https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&daily=precipitation_sum,et0_fao_evapotranspiration&forecast_days=16` | jw. | ✅ | SHOULD |
| Open‑Meteo Seasonal / Ensemble | prognoza sezonowa i ensemble (niepewność prognozy) | `https://seasonal-api.open-meteo.com/…`, `https://ensemble-api.open-meteo.com/…` | jw. | ❓ | NICE |
| **IMGW‑PIB API (bieżące)** | bieżące pomiary synoptyczne (T, opad, wilgotność, wiatr) | `https://danepubliczne.imgw.pl/api/data/synop` (lista stacji; `/station/{nazwa}` działa tylko dla nazw bez polskich znaków / po ID – sprawdzić) | bez klucza; warunek: podanie źródła „IMGW‑PIB” | ✅ | SHOULD |
| **IMGW‑PIB archiwum** | dobowe dane stacji synoptycznych, klimatycznych i opadowych (CSV w ZIP) – do **KBW metodą stacyjną jak w SMSR IUNG** | `https://danepubliczne.imgw.pl/data/dane_pomiarowo_obserwacyjne/dane_meteorologiczne/` | jw. | ✅ katalog dostępny | SHOULD (walidacja) |

> **Decyzja projektowa:** podstawą jest Open‑Meteo (1 zapytanie = 10 lat, każdy punkt Polski, < 1 s).
> IMGW służy do walidacji i do wersji „stacyjnej” KBW zgodnej z IUNG. Różnice opisać w README.

---

## 3. Dane satelitarne

| Źródło | Co daje | Endpoint | Dostęp | Test | Priorytet |
|---|---|---|---|---|---|
| **Earth Search (Element84) STAC** | Sentinel‑2 L2A jako COG (`sentinel-2-c1-l2a`, `sentinel-2-l2a`), Sentinel‑1 GRD, Landsat C2 L2, Copernicus DEM | `https://earth-search.aws.element84.com/v1` (`/search` z `intersects`=geometria działki, `datetime`, `eo:cloud_cover<40`) | **bez konta** | ✅ kolekcje potwierdzone; S2 nad PL dopiero od 11.2016 (zob. §0) | **MUST** |
| **Landsat C2 L2 (Earth Search, `landsat-c2-l2`)** | reflektancja powierzchni 30 m (L5/L7/L8/L9) + temperatura powierzchni → NDVI, NDMI, LST dla lat **2006–2016** | jw. | bez konta | ✅ (2006: L5+L7, 2012: L7) | **MUST** (okno historyczne) |
| **MODIS MOD13Q1 v061 (Planetary Computer)** | NDVI/EVI 250 m co 16 dni, od 2000 – jednolity szereg do anomalii | `https://planetarycomputer.microsoft.com/api/stac/v1` kolekcja `modis-13Q1-061` | bez konta | ✅ | SHOULD |
| **Copernicus Data Space Ecosystem** | STAC + **Sentinel Hub Statistical API** (statystyki strefowe NDVI/NDMI dla poligonu w jednym zapytaniu – najszybsza droga do 10 lat w < 30 s), openEO | STAC: `https://stac.dataspace.copernicus.eu/v1`; Statistical API: `https://sh.dataspace.copernicus.eu/api/v1/statistics` | darmowe konto (OAuth client credentials), miesięczny limit jednostek | ✅ STAC; ❓ Statistical API (wymaga konta) | SHOULD |
| Microsoft Planetary Computer STAC | Sentinel‑2 L2A, Landsat – zapas na awarie Earth Search | `https://planetarycomputer.microsoft.com/api/stac/v1` (URL‑e podpisywane tokenem, bezpłatnie) | bez konta | ✅ | NICE (fallback) |
| **CLMS Soil Moisture** | Surface Soil Moisture 1 km (Sentinel‑1, dziennie, od 2014/2015), Soil Water Index 1 km | `https://land.copernicus.eu/en/products/soil-moisture` – pobieranie przez CLMS Download API lub CDSE (sekcja CLMS) | darmowe konto; atrybucja | ❓ | SHOULD |
| **CLMS HR‑VPP** | Plant Phenology Index i parametry sezonu (start, szczyt, koniec) 10 m, od 2017 → **interpretacja zależna od uprawy** | Sentinel Hub collections (`vegetation-phenology-and-productivity-parameters-season-1`) / WEkEO | darmowe konto | ❓ | NICE (innowacyjność) |
| Landsat 8/9 C2 L2 – LST | temperatura powierzchni → TCI / VHI (stres termiczny) | Earth Search `landsat-c2-l2` | bez konta | ✅ kolekcja | NICE |

Pasma Sentinel‑2 potrzebne do metod: `B04, B05, B08, B8A, B11, SCL` (maska chmur).

---

## 4. Dane glebowe i rolnicze

| Źródło | Co daje | Endpoint / przykład | Dostęp | Test | Priorytet |
|---|---|---|---|---|---|
| **IUNG – kategorie podatności gleb na suszę** ⭐ | kategoria I–IV dla punktu (to samo co w SMSR) | WMS GeoServer IUNG: `https://sgeo.iung.pl/geoserver/Susza/wms` – warstwa `Susza:katgl_landuse2024`, `REQUEST=GetFeatureInfo&INFO_FORMAT=application/json` → `{"GRAY_INDEX": 2}` (= kat. II) | publiczny WMS (adres znaleziony w skrypcie mapy na susza.iung.pulawy.pl) | ✅ | **MUST** |
| **IUNG – progi KBW** ⭐ | progi suszy rolniczej: 14 upraw × 4 kategorie × 14 okresów 6‑dekadowych (Rozp. MRiRW 2019) | źródło: `https://susza.iung.pulawy.pl/progi/` → **już zapisane:** [dane/kbw_progi_iung.csv](dane/kbw_progi_iung.csv) (pobrane 2026‑11‑21) | publiczne | ✅ | **MUST** |
| IUNG – SMSR (komunikaty, mapy KBW, tabele dla gmin) | oficjalna ocena suszy per gmina co 10 dni → **walidacja / porównanie** | `https://susza.iung.pulawy.pl/kbw/`, `/mapy/`, `/wykazy/`, `/raporty/` | publiczne (HTML/mapy) | ✅ strony dostępne | SHOULD (walidacja) |
| IUNG – warstwa GAEC2 | mokradła i torfowiska (GAEC 2) → gleby organiczne, ochrona przed odwodnieniem | `https://sgeo.iung.pl/geoserver/wms` warstwa `GAEC2:GAEC2` | publiczny WMS | ⚠️ GetMap tak, GetFeatureInfo **wyłączone** → odczyt koloru piksela z GetMap | NICE |
| IUNG – monitoring wilgotności gleby (stacje) | pomiary wilgotności na stacjach IUNG | `https://susza.iung.pulawy.pl/mwgst/` | publiczne | ❓ format danych do sprawdzenia | NICE (walidacja) |
| **ISRIC SoilGrids v2 (REST)** | `sand`, `clay`, `silt`, `soc`, `bdod`, **`wv0033` (θ przy polowej pojemności), `wv1500` (θ przy punkcie więdnięcia)**, 6 głębokości do 200 cm, kwantyle Q0.05–Q0.95 (niepewność) | `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=17.75&lat=53.05&property=sand&property=clay&property=soc&property=wv0033&property=wv1500&depth=0-5cm&depth=30-60cm&value=mean&value=Q0.05&value=Q0.95` | CC BY 4.0; **limit ok. 5 zapytań/min**, serwis „beta” → cache obowiązkowy; alternatywa: WCS `maps.isric.org` | ✅ (na terenach miejskich wartości `null`) | **MUST** |
| EU‑SoilHydroGrids (ESDAC) | parametry hydrauliczne gleb 250 m (FC, WP) dla Europy | ESDAC JRC | wymaga rejestracji i akceptacji | ❓ | NICE |
| GUS BDL API | struktura zasiewów w gminie → domyślna podpowiedź uprawy | `https://bdl.stat.gov.pl/api/v1/` | bezpłatne (klucz opcjonalny) | ❓ | NICE |

### 4a. Co rośnie na działce (uprawa bieżąca i w latach ubiegłych)

| Źródło | Co daje | Lata | Dostęp | Test | Priorytet |
|---|---|---|---|---|---|
| **ARiMR – Geoportal, warstwy GSA i LPIS** ⭐ | **zadeklarowane uprawy** z wniosków o dopłaty (zagregowane, bez danych osobowych), działki referencyjne, MKO, TUZ | od kampanii 2025 (publiczne od 11.12.2025 / 05.03.2026); zasięg wstecz do sprawdzenia | `https://geoportal.arimr.gov.pl` – WMS / WFS / SHP, bez logowania; opis warstw: „Załącznik A1” w zakładce Dokumenty | ❓ adres usługi do ustalenia (portal to aplikacja JS) | **SHOULD** – podpowiedź uprawy + historia płodozmianu |
| **Copernicus HRL Croplands – Crop Types** | typ uprawy per piksel 10 m, 19 klas (pszenica, jęczmień, kukurydza, rzepak…) | 2017–2021 (2022–2024 zapowiedziane) | CLMS, „Download by area” / WEkEO (konto) | ❓ | SHOULD – uprawa w latach ubiegłych |
| JRC EU Crop Map | typ uprawy 10 m dla UE | 2018, 2022 | GEE `JRC/D5/EUCROPMAP/V1`, JRC Data Catalogue | ❓ | NICE |
| ESA WorldCereal | kukurydza / zboża ozime / jare, 10 m | 2021 | Zenodo, GEE | ❓ | NICE |
| Własna klasyfikacja z Sentinel‑2 | ozime vs jare vs kukurydza vs użytek zielony z krzywej NDVI w sezonie | każdy rok ≥ 2017 | z danych, które i tak pobieramy | – | NICE (gdy brak powyższych) |
| GUS BDL | struktura zasiewów w gminie | roczna | API BDL | ❓ | fallback |

**Zastosowanie:**
1. Ekran startowy podpowiada uprawę („wg ARiMR w 2025 r.: kukurydza”), rolnik tylko potwierdza.
2. Historyczna podatność liczona z **faktyczną uprawą w danym roku** (próg IUNG dla tej uprawy), a nie „jak gdyby co roku rosła ta sama”. To usuwa jedno z ograniczeń raportu.
3. Płodozmian pozwala na rekomendację „po kukurydzy wysiej międzyplon”.

Uwaga do jednostek SoilGrids: `wv0033` i `wv1500` mają `d_factor=10` (wartość 381 oznacza 38,1% obj.).
`sand`, `clay`: g/kg ×10 → %, `soc`: dg/kg.

---

## 5. Dane hydrologiczne

| Źródło | Co daje | Endpoint | Dostęp | Test | Priorytet |
|---|---|---|---|---|---|
| **IMGW‑PIB hydro (bieżące)** | stany wód na wodowskazach z `lat/lon`, stany ostrzegawcze i alarmowe → najbliższy ciek, „czy rzeka jest niżówkowa” | `https://danepubliczne.imgw.pl/api/data/hydro/` | bez klucza | ✅ | SHOULD |
| IMGW‑PIB hydro archiwum | dobowe stany i przepływy (do niżówek w 10 latach) | `https://danepubliczne.imgw.pl/data/dane_pomiarowo_obserwacyjne/dane_hydrologiczne/` | jw. | ✅ katalog | NICE |
| **Hydroportal ISOK / KZGW (Wody Polskie)** | MPHP10k – sieć hydrograficzna, zlewnie; mapy zagrożeń | `https://isok.gov.pl/hydroportal.html`; usługi pod `https://wody.isok.gov.pl/wss/…` (np. INSPIRE WORP). Listę usług daje wtyczka QGIS „Wody Polskie – Baza WMS” | bezpłatne | ⚠️ zgadywany adres MPHP zwrócił 401 – **prawidłowy URL do ustalenia** (wtyczka QGIS lub mentor T. Rychlicki) | SHOULD |
| BDOT10k (hydrografia) | rowy melioracyjne i kanały (`SWKN`), cieki (`SWRS`), zbiorniki (`PTWP`) | zob. §1 | bezpłatne | ⚠️ | SHOULD |
| PIG‑PIB – GZWP (WMS) | główne zbiorniki wód podziemnych | `http://epsh.pgi.gov.pl/gzwp-wms/service.svc/get` | bezpłatne | ❓ | NICE |
| PIG‑PIB – CBDH (WMS) | otwory hydrogeologiczne (głębokość zwierciadła wody) → potencjalne źródło wody do nawadniania | `https://cbdgmapa.pgi.gov.pl/arcgis/services/hydrogeologia/cbdh_otwory/MapServer/WMSServer` | bezpłatne | ❓ | NICE |
| PIG‑PIB – monitoring wód podziemnych (PSH) | stany wód podziemnych, ostrzeżenia hydrogeologiczne (niżówki) | `https://epsh.pgi.gov.pl` (HydroGeoPortal), ATOM `egdi.pgi.gov.pl/cgi-bin/mwp/atom.cgi` | bezpłatne | ❓ | NICE |
| Ewidencja urządzeń melioracji wodnych (Wody Polskie) | rowy, drenaże, grunty zmeliorowane | brak publicznej usługi znalezionej w researchu (inwentaryzacja KPO zakończona 12.2025) | – | ❓ | zapytać mentora |

---

## 6. Tło suszowe i kontekst (walidacja, porównanie)

| Źródło | Co daje | Endpoint | Test | Priorytet |
|---|---|---|---|---|
| **EDO – European Drought Observatory (WMS)** | warstwy: `cdiad` **Combined Drought Indicator v4.1**, `smang` Soil Moisture Index Anomaly, `smian` SMI Anomaly, `fpanv` fAPAR Anomaly (VIIRS), `spaST`/`spaLT` SPI ERA5 krótko- i długoterminowy, `rdria` **Risk of Drought Impact for Agriculture**, `twsan` GRACE TWS Anomaly, `lfinx_*` Low‑Flow Index. Wymiar `TIME`: 2012‑01‑01 → teraz, co 10 dni | `https://drought.emergency.copernicus.eu/api/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=cdiad&TIME=2025-07-01&…` | ✅ GetCapabilities, ⚠️ **GetFeatureInfo zwraca „Invalid request type”** → wartość odczytać z koloru piksela (legenda) lub pobrać rastry z EDO Data Download | SHOULD |
| Wody Polskie – PPSS (plan przeciwdziałania skutkom suszy) | mapy zagrożenia suszą (rolniczą, hydrologiczną, hydrogeologiczną) – kontekst regionalny | `https://stopsuszy.pl`, gov.pl/web/wody-polskie | ❓ | NICE |

---

## 7. Co jeszcze warto mieć (spoza listy KOWR) – podsumowanie researchu

1. **Progi KBW IUNG w CSV** – rdzeń oceny „po polsku”, już pobrane.
2. **WMS IUNG z kategorią gleby (GetFeatureInfo)** – ten sam podkład co SMSR, odczytywany dla dowolnego punktu.
3. **Open‑Meteo ma gotowe ET0 FAO‑56 i wilgotność gleby ERA5‑Land** – nie trzeba liczyć Penmana‑Monteitha samemu.
4. **SoilGrids `wv0033` / `wv1500`** – bezpośrednio θFC i θWP do bilansu FAO‑56, bez funkcji pedotransferowych, razem z kwantylami niepewności.
5. **Sentinel Hub Statistical API (CDSE)** – realna szansa na 10 lat NDVI/NDMI w < 30 s.
6. **EDO CDI i `rdria`** – europejski punkt odniesienia do walidacji i „drugiej opinii” w raporcie.
7. **IMGW hydro z współrzędnymi** – najbliższy wodowskaz i jego stan (niżówka) jako dane hydrologiczne „na żywo”.
8. **KIEG kontury** – klasa bonitacyjna z EGiB tam, gdzie starostwo ją publikuje.
9. **HR‑VPP** – fenologia per piksel, czyli argument „interpretujemy satelity zgodnie z uprawą”.
10. **IUNG GAEC2** – torfowiska i mokradła, czyli argument za rekomendacją „nie odwadniać / piętrzyć”.

---

## 8. Licencje i atrybucje (do README, pkt 4.2.7)

| Źródło | Licencja / warunki |
|---|---|
| GUGiK (ULDK, KIEG, NMT, BDOT10k, EGiB) | dane PZGiK udostępniane bezpłatnie (ustawa PGiK, art. 40a), atrybucja „GUGiK” |
| Open‑Meteo | CC BY 4.0 (dane), darmowe API do użytku niekomercyjnego; dane źródłowe ERA5 © ECMWF / Copernicus C3S |
| IMGW‑PIB | „Źródłem pochodzenia danych jest Instytut Meteorologii i Gospodarki Wodnej – Państwowy Instytut Badawczy” (wymagana informacja; dane przetworzone – oznaczyć) |
| Copernicus Sentinel / CLMS / EDO | bezpłatny, pełny i otwarty dostęp (rozp. UE 1159/2013), atrybucja „Contains modified Copernicus Sentinel data [rok]” / „© European Union, Copernicus Land Monitoring Service” / „© EU, Copernicus EMS – EDO” |
| ISRIC SoilGrids | CC BY 4.0 |
| Landsat (USGS), MODIS (NASA) | domena publiczna; atrybucja „Landsat imagery courtesy of the U.S. Geological Survey”, „MODIS – NASA LP DAAC” |
| IUNG‑PIB (SMSR, WMS) | dane publiczne; podać źródło „IUNG‑PIB, System Monitoringu Suszy Rolniczej” – **warunki ponownego wykorzystania WMS potwierdzić** (mail susza@iung.pulawy.pl lub mentor) |
| OpenStreetMap | ODbL – „© OpenStreetMap contributors” |
| PIG‑PIB, Wody Polskie | dane publiczne, atrybucja instytucji |

---

## 9. Ryzyka dostępności i plan awaryjny

| Ryzyko | Mitigacja |
|---|---|
| SoilGrids wolny lub limit 5/min | cache per punkt (siatka 250 m); fallback: kategoria IUNG → typowe θFC/θWP z tabeli kategorii |
| Overpass przeciążony | BDOT10k (paczka powiatu, cache) lub pominięcie z komunikatem „brak danych o rowach” |
| Chmury, brak scen S2 | komunikat w raporcie + wyższa waga SM (ERA5‑Land/CLMS); pewność = niska |
| WCS NMT GUGiK nie odpowiada | Copernicus DEM 30 m (Earth Search) + adnotacja o mniejszej dokładności |
| Działka miejska lub nierolnicza (SoilGrids `null`, IUNG brak kategorii) | wykryć i powiedzieć wprost: „działka poza użytkami rolnymi – analiza ograniczona” |
| Data analizy historyczna | każde zapytanie z `end_date = data_analizy`; dla S2 `datetime ≤ data_analizy`; dla prognozy „z przeszłości” użyć Open‑Meteo **Historical Forecast API** (`historical-forecast-api.open-meteo.com`, archiwum prognoz od ok. 2022 – ❓ zakres do potwierdzenia); dla starszych dat sekcja nawadniania bez prognozy, z komunikatem |
