# Test API pipeline'u – wyniki (2026‑11‑21)

Każde źródło z [pipeline_plan.md](pipeline_plan.md) odpytane na żywo z tego komputera.
Punkt testowy: działka 041005_5.0008.57/11 (gm. Szubin, 53,05°N 17,75°E). Dodatkowe punkty kontrolne w innych regionach Polski.
Zakres czasu: daty analizy 2016–2026, czyli dane potrzebne od **2006** (10 lat wstecz od daty z 2016 r.).

Legenda: ✅ działa w całym zakresie · ⚠️ działa z ograniczeniem · ❌ nie nadaje się w tej formie

## Podsumowanie

| # | Źródło | Wynik | Czas odpowiedzi | Lata | Uwagi / decyzja |
|---|---|---|---|---|---|
| – | **ULDK** GetParcelById / ByXY / ByIdOrNr | ✅ | 0,7–3 s | stan obecny | zły numer → `-1 brak wyników` (obsłużyć); `result=geom_extent&srid=2180` daje bbox w układzie 1992 |
| P1 | **Open‑Meteo Archive** (opad, ET0, Tmax/Tmin) | ✅ | 0,9 s (11 lat), 2,5 s (51 lat) | 1976–2026 bez braków | 1 zapytanie na całe okno + 30 lat klimatologii; dane do wczoraj |
| P2 | Open‑Meteo – wilgotność gleby | ✅ | 0,6 s (dobowe `_mean`) / 4 s (godzinowe, 3,5 MB) | 2016–2026 bez braków | używać **dobowych** `soil_moisture_*_mean` |
| P3 | Open‑Meteo Forecast 16 dni | ✅ | 0,3 s | tylko „dziś” | dla dat archiwalnych klimatologia (zgodnie z planem) |
| P4 | **IUNG kategoria gleby** (WMS GetFeatureInfo) | ✅ | 0,4–0,7 s | stała | kody: **1–4 kategorie, 5 gleby organiczne, 11 las, 12 woda, 13 zabudowa, 14 drogi/nieużytki, 19/99 niesklasyfikowane** → od razu wykrywa działkę nierolniczą i gleby organiczne (zastępuje P9 GAEC2) |
| P5 | **SoilGrids** REST | ⚠️ | **10–14 s** (5 głębokości + kwantyle), 2 s (1 głębokość) | stała | pytać tylko o 1–2 głębokości lub cache; wolny i z limitem |
| P6 | Progi KBW IUNG (CSV) | ✅ | lokalnie | stała | – |
| P7 | **NMT 1 m GUGiK (WCS)** | ⚠️ dane OK, **za wolno** | **61–117 s** niezależnie od wielkości obszaru | stan obecny | wysokości poprawne (68–97 m); w 30 s się nie zmieści → **Copernicus DEM 30 m** (odczyt COG 0,6 s) na pierwszy wynik, NMT 1 m doładowywany w tle / cache |
| P8 | **BDOT10k** (paczka powiatu) | ✅ | **22 s** pobrania (54 MB) | stan obecny | zawiera **rowy melioracyjne (SWRM)**, rzeki (SWRS), kanały (SWKN), wody (PTWP); policzone: woda 177 m, rów 740 m od działki testowej. **Serwer obsługuje HTTP Range** (206) → z ZIP-a pobieramy tylko 4 pliki hydrografii (~2 MB skompresowane, 1–2 s) |
| P8b | OSM Overpass | ❌ | 20 s | – | w okolicy testu tylko 1 obiekt, brak rowów → nie używać jako źródła rowów |
| P9 | IUNG GAEC2 | – | – | – | niepotrzebne: kod 5 w P4 |
| P10a | Sentinel‑2 – **Earth Search** | ⚠️ | ~1 s wyszukiwanie, 1,7 s odczyt pasma | **2016: 0 scen**, 2017: 4, 2018+: 13–35 | kolekcja `sentinel-2-c1-l2a` ma dziury (2017, 2022 = 0) |
| P10b | Sentinel‑2 – **Planetary Computer** | ✅ | odczyt pasma 0,5 s | **2016: 10, 2017: 10**, 2018+: 17–25 scen/lato | **główne źródło S2**; bez konta, URL podpisywany tokenem SAS |
| P10c | Landsat – Earth Search | ❌ | – | – | pliki w `s3://usgs-landsat` (płatny transfer, requester pays) |
| P10d | **Landsat – Planetary Computer** | ✅ | 0,45 s | 2006: 7, 2012: 5 (tylko L7), 2016: 9 scen/lato | źródło dla lat 2006–2016 |
| P10e | MODIS 13Q1 – Planetary Computer | ✅ | – | 2006: 17 kompozytów/lato | tło 250 m |
| P10f | Sentinel‑2 – CDSE | ⚠️ | – | 2016 dostępne | pobieranie wymaga konta (nie testowane); niepotrzebne, skoro PC działa |
| P11a | **ARiMR GSA – uprawy (WFS)** 2025, 2026 | ✅ | **0,2 s** | 2025, 2026 | `https://geoportal-w2.arimr.gov.pl/geoserver/gsa_public/uprawy_{rok}/wfs`, warstwa `gsa_public:uprawy_rolne_{rok}`; zwraca `roslina`, `grupa_roslin`, `pow`; działka testowa: 2025 owies, 2026 jęczmień ozimy |
| P11b | ARiMR GSA – uprawy 2020–2024 | ⚠️ | ~88 MB / województwo | 2020–2024 | tylko **shapefile per województwo** (WFS dla tych lat: 404) → przetworzyć wcześniej do jednego pliku z indeksem przestrzennym |
| P11c | JRC EU Crop Map | ✅ (katalog) | – | **2018, 2022** | `https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/EUCROPMAP/` |
| P11d | Copernicus Crop Types | ❓ | – | – | strona produktu pod sprawdzanym adresem zwraca 404; później znalezione w katalogu CDSE (2017–2024, pobranie z kontem) – zob. USLUGI_Z_KONTEM.md |
| P12 | **EDO WMS** (GetMap z TIME) | ⚠️ | 0,6–2 s | CDI 2012+, SMA 1995+ | GetMap działa dla 2016 i 2026, ale zwraca **obrazek** (wartość tylko z koloru); `spaST` dla 2006 → 400 → tylko porównanie, nie wejście reguł |
| P13 | IMGW hydro (bieżące) | ✅ | 2,4 s | tylko dziś | – |
| P13b | IMGW archiwum (synop dobowe) | ✅ | – | od 1966 do 2026 | ZIP per rok/stacja – do walidacji KBW |
| – | Sentinel Hub Statistical API (CDSE) | ❓ | – | – | wymaga konta; nie testowane |
| – | CLMS Soil Moisture 1 km | ❓ | – | – | wymaga konta; nie jest konieczne (P2 pokrywa całe okno) |

## Czy pipeline zadziała dla dat 2016–2026?

**Tak** – każdy element ma źródło sięgające 2006 r.:

| Element | Pokrycie 2006–2026 |
|---|---|
| Pogoda, bilans wody, SPEI, scenariusze | ✅ Open‑Meteo, bez braków |
| Gleba, progi IUNG, teren, rowy | ✅ dane stałe (stan obecny) |
| Satelita (wilgotność roślin) | ✅ Planetary Computer: Landsat 2006–2016, Sentinel‑2 2016+ |
| Uprawy w poszczególnych latach | ⚠️ ARiMR 2020–2026 (WFS 2025–26, shapefile 2020–24), JRC 2018 i 2022; **2016, 2017, 2019: brak gotowej mapy** → klasyfikacja ML1 (METODY.md §8, TODO T4.11) albo pytanie rolnika |

Kontrola sensowności (bilans maj–lipiec P − ET0, działka testowa): najsuchsze lata 2008 (−292), 2023 (−246),
2019 (−237), 2006 (−235), 2022 (−226); najwilgotniejsze 2007 (−8), 2020 (−15), 2009 (−22), 2017 (−26).
To zgadza się ze znanymi latami suszy w Polsce (2006, 2015, 2018, 2019) i latami wilgotnymi (2017, 2020).

## Wnioski dla budżetu 30 s

| Problem | Rozwiązanie |
|---|---|
| NMT 1 m: 60–117 s | pierwszy wynik z Copernicus DEM 30 m; NMT 1 m pobierany w tle i podmieniany (albo cache per działka) |
| BDOT10k: 22 s na cały ZIP powiatu | pobierać tylko 4 pliki hydrografii przez HTTP Range (`remotezip`, ~2 MB, 1–2 s) + cache per powiat |
| SoilGrids: 10–14 s | 1–2 głębokości, zapytanie równolegle z resztą; kategoria IUNG jako główne źródło |
| ARiMR 2020–2024: duże shapefile | wcześniej przetworzone do jednego pliku (np. GeoParquet) |
| Satelita 10 sezonów | Planetary Computer + odczyt tylko pikseli działki (COG) w oknach wrażliwości |
