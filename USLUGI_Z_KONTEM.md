# Usługi wymagające konta – co dają i czy warto

Wszystko, czego używamy teraz, działa **bez konta** (zob. [TEST_API.md](TEST_API.md)). Ten plik zbiera usługi,
które wymagają rejestracji, i ocenia, ile realnie dodadzą. Konto zakłada **zespół**, nie rolnik: klucze trzymamy
w zmiennych środowiskowych serwera, więc wymóg 5.4 („rolnik nie musi kupować licencji ani zakładać kont”) jest spełniony.

Sprawdzone 2026‑11‑21: katalogi i zasięg lat odpytane bez logowania. Samego pobierania plików (wymaga kluczy) nie testowaliśmy.
Szacunki punktów to **ocena zespołu**, nie wyliczenie – mówią, gdzie usługa pomaga w kryteriach z rozdz. 7.

---

## Podsumowanie

| # | Usługa | Co rozwiązuje | Szac. zysk | Czas założenia | Rekomendacja |
|---|---|---|---|---|---|
| 1 | **Copernicus Data Space (CDSE)** | uprawy 2017–2024, daty wschodów i zbiorów per działka, teren 10 m, satelitarna wilgotność gleby, szybkie statystyki satelitarne | **+3–5 pkt** | 10–15 min | **TAK – zakładamy** |
| 2 | ESDAC (JRC) – EU‑SoilHydroGrids | lepsza retencja gleby (pojemność polowa, punkt więdnięcia) dla Europy | +0,5–1 pkt | wniosek, akceptacja ręczna (godziny–dni) | złożyć wniosek od razu; użyć, jeśli przyjdzie na czas |
| 3 | NASA Earthdata (HLS) | jeden spójny szereg satelitarny 30 m od 2013 r. | +0,5–1 pkt | 10 min | opcjonalnie, po MVP |
| 4 | Płatne API modelu językowego | asystent „Zapytaj”, prostszy język raportu | +0,5–1 pkt | 10 min + płatność | opcjonalnie; koszt trzeba opisać (5.4) |
| 5 | Google Earth Engine | wszystko w jednym miejscu, szybkie obliczenia po stronie serwera | ~0 (dubluje 1) | 30+ min (projekt Google Cloud) | nie, chyba że ktoś zna GEE |
| 6 | Copernicus Climate Data Store (CDS) | ERA5, prognozy sezonowe | ~0 | 10 min | **nie** – Open‑Meteo daje to bez konta |
| 7 | EUMETSAT H SAF (ASCAT) | wilgotność gleby z satelity | ~0 | 15 min | nie – dubluje CDSE (SWI) |

**Łącznie realnie:** CDSE to ok. 80% możliwego zysku. Reszta to drobne poprawki.

---

## 1. Copernicus Data Space Ecosystem (CDSE) ⭐

**Konto:** darmowe, https://dataspace.copernicus.eu. Daje dostęp do magazynu plików (S3 `eodata`), pobierania (OData)
i API Sentinel Hub (Process, Statistical) z miesięcznym darmowym limitem (wysokość limitu sprawdzić w panelu po rejestracji).

**Co sprawdziliśmy w katalogu** (`stac.dataspace.copernicus.eu/v1`, 428 kolekcji, bez logowania):

| Kolekcja | Co to jest | Lata nad działką testową | Co nam daje |
|---|---|---|---|
| `clms_vlcc_crop-types_europe_10m_yearly_v1` (+ warstwa pewności) | **mapa typów upraw 10 m**, Copernicus | **2017–2024** (2016, 2025, 2026: brak) | **zapełnia luki w uprawach 2017 i 2019**; lata 2018–2024 bez przetwarzania shapefile'i ARiMR. Po tym zostaje tylko 2016 |
| `clms_vlcc_main-crop-emergence_…`, `…main-crop-harvest_…`, `…main-crop-duration_…` | **data wschodów i zbiorów** głównej uprawy per piksel 10 m | 2017+ | prawdziwy kalendarz uprawy **dla tej działki i roku** zamiast tabeli średnich: lepsze okna wrażliwości (F12) i interpretacja zdjęć „zgodnie z uprawą” (wymóg 3.2 pkt 1a) |
| `clms_vlcc_secondary-crop-*` | uprawa wtórna (np. międzyplon) | 2017+ | wiemy, czy rolnik już stosuje międzyplon → nie zalecamy czegoś, co już robi |
| `clms_vlcc_grassland-mowing-*` | terminy pokosów łąk | 2017+ | lepsza ocena łąk (dla nich IUNG nie ma progów) |
| `cop-dem-eea-10-laea-tif` | **model terenu 10 m** (Copernicus DEM EEA‑10) | dane stałe | spadki i zagłębienia od razu w 10 m zamiast 30 m, póki NMT 1 m GUGiK (60–117 s) się ładuje |
| `clms_ssm_europe_1km_daily_v1_cog` | **wilgotność powierzchni gleby z Sentinel‑1** (radar, działa przez chmury) | **od 10.2014** | niezależny, satelitarny sygnał wilgotności gleby → 4. sygnał do pewności i weryfikacja modelu |
| `clms_swi_europe_1km_daily_v2_cog` (v1 wcześniej) | wskaźnik wody w glebie 1 km | v2 od 07.2025 | jw., głębsza warstwa |
| `sentinel-2-l2a` + Sentinel Hub Statistical API | statystyki strefowe działki (NDVI/NDMI) dla wielu dat w **jednym zapytaniu** | 2015+ | etap satelitarny z 5–15 s do ok. 1–3 s; mniej kodu do odczytu COG |
| `sentinel-1-grd` | radar | 2014+ | podstawa do własnej wilgotności gleby 10–20 m (opcja na później) |

**Wpływ na ocenę (szacunek):**
- Dane i wiarygodność (25%): **+2–3 pkt** – uprawy z każdego roku 2017–2026, kalendarz upraw z satelity, niezależny pomiar wilgotności gleby.
- Działający prototyp / szybkość (15%): **+1–2 pkt** – szybszy etap satelitarny i teren 10 m od razu.
- Innowacyjność (20%): **+0–1 pkt** – „wiemy, kiedy na Twoim polu wzeszła kukurydza”.

**Jak podpiąć (po założeniu konta):**
1. Rejestracja: https://dataspace.copernicus.eu → potwierdzenie e‑mail.
2. Klucze S3 do plików `s3://eodata/…`: generator kluczy w panelu CDSE (eodata S3 keys manager); endpoint `https://eodata.dataspace.copernicus.eu`.
3. Sentinel Hub (Statistical API): w panelu „Sentinel Hub Dashboard” utworzyć klienta OAuth; token z `https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`.
4. Zmienne środowiskowe: `CDSE_S3_ACCESS_KEY`, `CDSE_S3_SECRET_KEY`, `SH_CLIENT_ID`, `SH_CLIENT_SECRET`. Nigdy w repozytorium (T12.6).
5. Odczyt: `rasterio` z sesją S3 (`AWS_S3_ENDPOINT=eodata.dataspace.copernicus.eu`, `AWS_VIRTUAL_HOSTING=FALSE`), tylko okno działki.

Adresy z punktów 2–3 sprawdzić w panelu po rejestracji – nie testowaliśmy ich z kluczami.

**Ryzyka:** limity zapytań (katalog zwrócił nam raz `429 Too Many Requests` przy szybkiej serii) → cache i odstępy między zapytaniami;
miesięczny limit Sentinel Hub → statystyki tylko dla okien wrażliwości. Fallback zostaje bez zmian: Planetary Computer + ARiMR + JRC.

**Zmiany w planie po podpięciu:**
- P11 / F0h: CDSE Crop Types 2017–2024 + ARiMR WFS 2025–2026 → shapefile'i ARiMR 2020–2024 nie trzeba przetwarzać.
- F12: kalendarz faz z `main-crop-emergence/harvest` dla działki i roku; tabela średnich tylko jako zapas.
- P7: pierwszy wynik terenu z DEM 10 m zamiast 30 m.
- Pewność: 4. sygnał z `clms_ssm` (wilgotność gleby z radaru) zamiast obrazka z EDO.
- P10: opcjonalnie Statistical API zamiast własnego odczytu COG.

---

## 2. ESDAC (JRC) – EU‑SoilHydroGrids

- **Co:** mapy właściwości wodnych gleb Europy 250 m (pojemność polowa, punkt więdnięcia, przewodność) na kilku głębokościach, z funkcji dopasowanych do gleb europejskich.
- **Po co:** pojemność wodna gleby (TAW, F6b) to podstawa bilansu i scenariuszy. SoilGrids jest globalny i wolny (10–14 s); IUNG daje tylko 4 klasy.
- **Zysk:** +0,5–1 pkt (wiarygodność bilansu).
- **Haczyk:** formularz na stronie ESDAC i **ręczna akceptacja** (godziny–dni) → złożyć wniosek od razu; jeśli dane nie przyjdą w trakcie hackathonu – zostajemy przy IUNG + SoilGrids. Dane statyczne → pobrać raz dla Polski i opisać w README z datą.

## 3. NASA Earthdata – HLS (Harmonized Landsat Sentinel‑2)

- **Co:** Landsat 8/9 i Sentinel‑2 przeliczone do jednej siatki 30 m i wspólnej kalibracji. Dostęp: konto Earthdata Login, katalog `https://cmr.earthdata.nasa.gov/stac/LPCLOUD` (kolekcje `HLSL30_2.0`, `HLSS30_2.0`).
- **Po co:** anomalie wilgotności roślin liczone na **jednym spójnym szeregu od 2013 r.** zamiast osobno dla każdego sensora. Planetary Computer ma HLS dopiero od 2020 r. (sprawdzone).
- **Zysk:** +0,5–1 pkt (metodyka). Lata 2006–2012 i tak zostają na Landsat 5/7.
- **Kiedy:** po MVP, jeśli starczy czasu.

## 4. Płatne API modelu językowego

- **Co:** asystent „Zapytaj” w raporcie i przepisywanie zdań na prostszy język.
- **Zasady (już w METODY.md §8):** model dostaje gotowe fakty z raportu i **nie liczy** wyniku ani nie wybiera zaleceń; bez modelu raport działa w całości.
- **Zysk:** +0,5–1 pkt (prostota, innowacyjność), jeśli dobrze ugruntowany w danych.
- **Koszt:** płatne za użycie → wymóg 5.4: wpisać w README przewidywany koszt i alternatywę (szablony zdań bez modelu).

## 5. Google Earth Engine

- **Co:** ogromny katalog (Sentinel, Landsat, mapy upraw JRC, WorldCereal) i obliczenia po stronie Google.
- **Dlaczego nie:** dubluje CDSE i Planetary Computer, wymaga projektu Google Cloud i rejestracji do użytku niekomercyjnego, a przy wdrożeniu przez KOWR pojawia się kwestia licencji. Sens tylko, jeśli ktoś w zespole już dobrze zna GEE.

## 6. Copernicus Climate Data Store (CDS) – nie potrzebny

- ERA5‑Land mamy z Open‑Meteo.
- **Prognozy sezonowe też są w Open‑Meteo bez klucza**: `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=…&longitude=…&daily=precipitation_sum,et0_fao_evapotranspiration&forecast_days=183` (sprawdzone: 200, 0,9 s, 6 miesięcy). Można nimi opcjonalnie „przechylić” scenariusze na kolejny sezon – bez zakładania konta.

## 7. EUMETSAT H SAF (ASCAT) – nie potrzebny

- Wilgotność gleby z satelity ASCAT. Ten sam typ informacji daje CDSE (`clms_swi`, `clms_ssm`) – jedno konto zamiast dwóch.

---

## Decyzja do podjęcia

1. **Założyć konto CDSE** (10–15 min) – największy zysk, pełny fallback bez konta zostaje.
2. **Złożyć wniosek do ESDAC** od razu – nic nie kosztuje, może przyjść na czas.
3. HLS i model językowy – dopiero po MVP.

Po decyzji: dopisać do TODO.md zadania (podpięcie CDSE do P7/P10/P11/F12 i 4. sygnału pewności) oraz do README listę kont, zmiennych środowiskowych i limitów.
