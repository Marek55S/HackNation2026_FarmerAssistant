# Metody analityczne – KOWR „Zatrzymaj wodę, chroń plony”

Dokument roboczy zespołu. Zbiera metody, które warto zaimplementować, z uzasadnieniem w bibliografii KOWR
(„Podstawy naukowe…”) i w wymaganiach zadania. Do każdej metody podano: **co liczy**, **z jakich danych**,
**do którego etapu raportu trafia** i **na które źródło się powołać** (kryterium oceny nr 2, 25%: „zgodność metod
z aktualną wiedzą naukową”).

> Źródła danych i endpointy opisuje [ZRODLA_DANYCH.md](ZRODLA_DANYCH.md).
> Oficjalne progi KBW IUNG (uprawa × kategoria gleby × okres) są zapisane w [dane/kbw_progi_iung.csv](dane/kbw_progi_iung.csv).

---

## 0. Szkielet logiczny – kolejność jest wymagana

KOWR (zadanie, pkt 3.2, oraz „Podstawy naukowe”, s. 3) wymaga ścisłej sekwencji:

```
[1] OCENA SYTUACJI WODNEJ ──► [2] PRZYCZYNY ──► [3] RETENCJA ──► [4] AGROTECHNIKA ──► [5] NAWADNIANIE (opcja)
   (bieżąca + 10 lat)        (diagnoza)        (krajobraz)       (gleba)              (FAO-56 + prognoza)
```

Zasady implementacyjne, które z tego wynikają:
- Rekomendacje z etapów 3–5 są **funkcjami wyników** etapów 1–2, a nie gotowymi tekstami. Każda reguła ma
  warunek wejściowy, np. `kategoria_gleby <= II AND czestosc_suszy_10lat >= 0.4`, i zapisuje, które dane ją uruchomiły.
  Te dane trafiają do raportu jako uzasadnienie.
- Jeśli ocena z etapu 1 nie mogła się wykonać, np. przez brak danych, system **nie generuje** rekomendacji i mówi to wprost.
- Każda liczba w raporcie ma źródło, datę danych i poziom pewności (zob. §6).

---

## 1. Ocena sytuacji wodnej

### 1.1 Klimatyczny bilans wodny (KBW) w okresach 6‑dekadowych – metoda IUNG SMSR ⭐ kluczowa

- **Co:** `KBW = Σ P − Σ ETP` w kroczących okresach 60‑dniowych (sześć dekad) od 21.III do 30.IX.
  Wynik porównujemy z **urzędowymi progami** dla danej uprawy i kategorii gleby (Rozporządzenie MRiRW z 11.04.2019;
  tabela w `dane/kbw_progi_iung.csv`, 14 grup upraw × 4 kategorie gleb × 14 okresów).
  Według IUNG przekroczenie progu oznacza **przeciętnie ok. 20% spadku plonu** względem średniej wieloletniej.
- **Dlaczego to podstawa:** to oficjalna metodyka suszy rolniczej w Polsce (Doroszewski i in., 2012). Bardzo
  prawdopodobne, że „dane referencyjne jury” (zadanie, rozdz. 6) to mapy SMSR IUNG lub EDO. Zgodność z SMSR
  jest więc strategiczna.
- **Dane:** opad dobowy i ET0 z Open‑Meteo (ERA5‑Land, od 1950, ~9 km) lub stacje IMGW (archiwum dobowe).
  Kategoria gleby dla działki: warstwa IUNG `Susza:katgl_landuse2024` (GetFeatureInfo).
- **Uwaga metodyczna:** SMSR liczy ETP metodą Penmana z danych stacyjnych IMGW, a Open‑Meteo daje ET0 FAO‑56
  Penman‑Monteith z reanalizy. Różnice rzędu kilku–kilkunastu mm na okres trzeba opisać w „ograniczeniach raportu”.
  Na walidację warto policzyć wersję stacyjną (IMGW) i reanalizową, po czym porównać je w README.
- **Wyjście:** dla wybranej daty: KBW, próg, nadwyżka lub deficyt względem progu, status
  „susza / zagrożenie / brak”. Do tego wykres KBW na tle progu w sezonie.

### 1.2 Ewapotranspiracja wskaźnikowa i potrzeby wodne uprawy (FAO‑56)

- **Co:** ET0 Penman‑Monteith → `ETc = Kc(t) × ET0`. Kc zależy od fazy rozwoju uprawy (tab. 12 i 17 w FAO‑56,
  z datami faz dopasowanymi do Polski: siew, rozwój, pełnia, dojrzewanie).
- **Źródło:** Allen, Pereira, Raes, Smith – FAO Irrigation and Drainage Paper 56 (z bibliografii KOWR).
- **Po co:** KBW opisuje „zapotrzebowanie atmosfery”, a ETc – **potrzeby konkretnej uprawy**. Spełnia to wymóg
  „uwzględnienia rodzaju uprawy” i stanowi wejście do bilansu glebowego (1.3) oraz nawadniania (§5).

### 1.3 Bilans wody w strefie korzeniowej („bucket model”, FAO‑56 rozdz. 8)

- **Co:** dzienny bilans: `Dr[i] = Dr[i−1] − (P − RO) − I + ETc·Ks + DP`
  - `TAW = 1000·(θFC − θWP)·Zr` – woda dostępna (mm); `RAW = p·TAW` – woda łatwo dostępna;
  - `Ks < 1` gdy `Dr > RAW` → roślina w stresie wodnym;
  - `RO` (spływ) można oszacować metodą SCS‑CN (zob. 2.3).
- **Dane:** θFC i θWP z SoilGrids (`wv0033`, `wv1500`) albo z kategorii IUNG (WOD: <127,5 / 127,5–170 / 170–202,5
  / >202,5 mm). `Zr` (głębokość korzeni) i `p` dla danej uprawy z FAO‑56, tab. 22.
- **Po co:** daje intuicyjny wskaźnik **„% wody dostępnej w glebie”** i **liczbę dni stresu w sezonie**.
  Łatwo to pokazać rolnikowi („zbiornik glebowy pełny w 35%”), a to samo jest bezpośrednim wejściem do decyzji
  o nawadnianiu.
- **Weryfikacja:** porównać przebieg z wilgotnością gleby ERA5‑Land (0–7, 7–28, 28–100 cm) i z CLMS SSM/SWI.

### 1.4 Znormalizowane wskaźniki suszy – SPI / SPEI

- **SPI** (McKee i in., 1993): opad przekształcony do rozkładu normalnego (gamma → N(0,1)), skale 1 i 3 miesiące.
- **SPEI** (Vicente‑Serrano i in., 2010): to samo dla `P − ET0` (rozkład log‑logistyczny); lepiej oddaje rolę temperatury.
- **Progi:** ≤ −1 susza umiarkowana, ≤ −1,5 silna, ≤ −2 ekstremalna.
- **Pułapka:** 10 lat to **za mało**, by stabilnie dopasować rozkład. Parametry dopasowujemy na **30 latach
  poprzedzających datę analizy** z ERA5 (Open‑Meteo ma je za darmo; dla daty 2017‑07‑15 to 1987–2017), a wynik
  pokazujemy dla 10 lat przed datą, jak wymaga zadanie. Stałe okno WMO 1991–2020 „widziałoby przyszłość” dla dat
  < 2020. Opisać to w README jako świadomą decyzję.
- **Po co:** pozwala porównać z EDO (SPI ERA5 jest warstwą EDO) i odróżnić „suchy rok” od „suchego klimatu”.

### 1.5 Wskaźniki satelitarne roślinności i uwilgotnienia (Sentinel‑2)

| Wskaźnik | Wzór (S2) | Co mówi |
|---|---|---|
| NDVI | (B08−B04)/(B08+B04) | wigor / biomasa |
| NDMI (NDWI Gao) | (B8A−B11)/(B8A+B11) | **zawartość wody w roślinie** – najbardziej „suszowy” |
| MSI | B11/B08 | stres wodny (odwrotnie do NDMI) |
| NDRE (opc.) | (B8A−B05)/(B8A+B05) | stres przy dużej biomasie, gdy NDVI się nasyca |

Sposób liczenia dla działki:
1. Geometria z ULDK → **bufor wewnętrzny −10 m**, żeby wyciąć miedze i drogi.
2. Maska chmur z warstwy SCL (zostawiamy klasy 4 i 5: roślinność i goła gleba), odrzucamy sceny z < 60% czystych pikseli w działce.
3. Statystyka strefowa: **mediana** i liczba czystych pikseli.
4. **Anomalia względem 10 lat** dla tego samego okna dni roku (±10 dni):
   - z‑score: `(x − μ_10lat) / σ_10lat`;
   - **VCI** (Kogan, 1995): `(NDVI − min) / (max − min) × 100` w tej samej dekadzie z 10 lat; < 35 = stres.
     Analogicznie VCI dla NDMI.

**10 lat wstecz od dowolnej daty (wymóg jury).** Sentinel‑2 L2A nad Polską jest dostępny od 07.2015 (CDSE)
lub od 11.2016 (Earth Search). Dla daty analizy np. 2017‑07‑15 okno 2007–2017 wymaga więc **drabiny sensorów**:
S2 (≥ 2017) → Landsat 8/7 (2013–2016) → Landsat 5/7 (2006–2012) + MODIS 250 m jako spójne tło (szczegóły:
ZRODLA_DANYCH.md §0). Konsekwencje:
- anomalię (z‑score, VCI) liczymy **wewnątrz jednego sensora** albo na MODIS; nie mieszamy bezwzględnych NDVI z S2 i Landsata;
- pikseli w działce jest mniej (30 m zamiast 10 m), co obniża pewność;
- Landsat 7 po 2003 ma pasy bez danych (SLC‑off) – maskujemy je jak chmury.

**Interpretacja zależna od uprawy** (wymóg zadania 3.2 pkt 1a, PolSA rozdz. 6.3.4):
- Każda uprawa dostaje **kalendarz fenologiczny i okno wrażliwości**: zboża ozime IV–VI (krzewienie → kłoszenie,
  krytycznie strzelanie w źdźbło i kwitnienie), kukurydza VII–VIII (wiechowanie i kwitnienie), ziemniak VI–VIII
  (tuberyzacja), rzepak IV–V (kwitnienie), użytki zielone cały sezon.
- **Spadek NDVI po dojrzewaniu i zbiorze nie jest suszą.** Poza oknem uprawy satelita nie wchodzi do oceny suszy
  albo dostaje niską wagę. Bez tego narzędzie pokaże „suszę” na każdym ściernisku w sierpniu.
- Opcjonalnie: krzywa fenologiczna CLMS HR‑VPP (PPI, 10 m) pozwala sprawdzić, czy sezon na działce przebiega typowo
  (start, szczyt, koniec sezonu).

### 1.6 Wilgotność gleby z mikrofal i reanalizy

- **ERA5‑Land soil moisture** (Open‑Meteo, 3 warstwy): ciągłe szeregi od 1950, ale rozdzielczość ~9 km. Służy do anomalii, nie do wartości bezwzględnych.
- **CLMS Surface Soil Moisture 1 km (Sentinel‑1)** i **Soil Water Index**: niezależne od chmur, od 2014/2015.
- **EDO `smang` / `smian`** – anomalia indeksu wilgotności gleby (gotowa, ~5 km, co 10 dni).
- Dopiero ich połączenie z danymi meteorologicznymi i glebowymi daje wiarygodną ocenę (KOWR, „Podstawy naukowe”, s. 2).

### 1.7 Integracja wskaźników – logika „Combined Drought Indicator” na poziomie działki

Według EDO (CDI v4) i przeglądu Żyłowska & Kozyra (2025) warto budować **łańcuch dowodów**, a nie jeden indeks:

| Poziom | Warunek | Komunikat dla rolnika |
|---|---|---|
| Obserwacja | SPI‑3 < −1 **lub** KBW < 50% progu | „Mniej opadów niż zwykle – obserwuj” |
| Ostrzeżenie | + deficyt w glebie (Dr > RAW lub anomalia SM < −1) | „Gleba wysycha – woda dla roślin ograniczona” |
| Alarm | + reakcja roślin (VCI < 35 / z‑NDMI < −1 w oknie wrażliwości) | „Rośliny reagują na suszę” |
| Susza rolnicza (urzędowa) | KBW < próg IUNG dla uprawy i gleby | „Spełnione kryterium suszy rolniczej wg IUNG” |

Zalety: wynik jest **wyjaśnialny** (rolnik widzi, który element się „zapalił”), zgodny z praktyką europejską
i z zasadą KOWR, że satelity nie są interpretowane samodzielnie.

### 1.8 Historyczna podatność działki (10 lat)

- Dla każdego z 10 sezonów: czy dla danej uprawy i gleby przekroczono próg KBW, w którym okresie, ile dni stresu (Ks<1),
  minimalny VCI w oknie wrażliwości.
- Wynik dla rolnika: **„W 6 z ostatnich 10 lat wystąpił niedobór wody; najczęściej od połowy maja do lipca”**,
  czyli wprost przykładowa rekomendacja z zadania.
- Wskaźnik ryzyka = częstość × średnia intensywność, w 3–4 klasach. Rozróżniamy **bieżące wystąpienie** suszy od
  **podwyższonego prawdopodobieństwa** (KOWR, „Podstawy naukowe”, s. 1).

### 1.9 Prognoza scenariuszowa – historia jako zbiór możliwych przyszłości ⭐

- **Co:** bilans wody w glebie (1.3) startuje z **dzisiejszego zapasu** i jest liczony dalej z pogodą każdego
  z 10 ostatnich sezonów (te same dni roku). Pierwsze 7–16 dni bierzemy z prognozy, gdy jest dostępna.
  Wynik to 10 przebiegów: ryzyko stresu w każdym tygodniu i miesiącu (np. „lipiec: 5/10”), przewidywany brak wody
  (mediana i 80. percentyl) i dzień, w którym zapas spadnie poniżej progu.
- **Efekt działań:** te same przebiegi z parametrami zmienionymi przez działanie (mniejsze parowanie pod mulczem,
  mniejszy spływ z pasem buforowym, zapas z oczka do nawadniania) dają „co zyskasz” dla każdej rekomendacji i ryzyko „z planem”.
- **Źródło:** Day G.N. (1985) Extended Streamflow Forecasting Using NWSRFS, *J. Water Resour. Plann. Manage.* 111(2):157–170
  (metoda Ensemble Streamflow Prediction). Bilans gleby: FAO‑56.
- **Ograniczenie, które piszemy wprost:** 10 lat to mała próba, a klimat się ociepla. Scenariusze to „jak bywało”, nie prognoza.
  Opcjonalnie można przesunąć je o trend temperatury z 30 lat.

---

## 2. Identyfikacja przyczyn niedoboru

„Podstawy naukowe” (s. 2) wymieniają cztery grupy przyczyn. Każdej przypisujemy mierzalne wskaźniki i punktację 0–3,
a raport pokazuje **ranking przyczyn** z uzasadnieniem.

| Przyczyna | Wskaźniki (dane) | Przykład progu |
|---|---|---|
| **2.1 Deficyt opadów + wysoka temperatura** | SPI/SPEI, KBW, najdłuższy ciąg dni bez opadu (CDD, P<1 mm), liczba dni z Tmax>30°C, VPD | SPEI‑3 < −1; CDD > 20 dni w V–VII |
| **2.2 Niska zdolność retencyjna gleby** | kategoria IUNG I–II, WOD, % piasku (SoilGrids), SOC < 1%, klasa bonitacyjna (V–VI) z KIEG | kat. I lub TAW < 100 mm |
| **2.3 Nadmierny odpływ powierzchniowy** | spadek terenu z NMT 1 m, akumulacja spływu, SCS‑CN (USDA NRCS) dla dni z opadem > 10 mm, brak zadrzewień i oczek w buforze 500 m | średni spadek > 3–5%; udział odpływu > 15% opadu |
| **2.4 Nadmierne odwodnienie (melioracje)** | odległość do rowów i cieków (BDOT10k / OSM), gęstość rowów w buforze, gleby organiczne (warstwa IUNG GAEC2) | rów w odległości < 100 m + gleba organiczna |
| **2.5 Wrażliwość uprawy** | uprawa × faza × okno krytyczne (FAO‑56, progi IUNG) | deficyt trafił w fazę krytyczną |

- **SCS Curve Number:** `Q = (P − 0,2S)² / (P + 0,8S)`, `S = 25400/CN − 254`. CN wynika z grupy hydrologicznej gleby
  (z uziarnienia) i użytkowania. Pokazuje, ile wody z ulewy „ucieka” z działki, co dobrze łączy się z tezą KOWR
  o ulewach przeplatanych suszą.
- **TWI** (Beven & Kirkby, 1979): `ln(a / tan β)` z NMT – mapa miejsc wilgotnych i suchych w obrębie działki.

---

## 3. Rekomendacje retencji krajobrazowej (NWRM)

Podstawa: European Commission (2014) *NWRM Policy Document* i (2015) *Guide to… NWRM*; zasada „retain water where it falls”.
Katalog nwrm.eu ma kody działań, które warto podawać w raporcie, np. „(NWRM A02)”, bo uwiarygadnia to rekomendację.

### 3.1 Analiza terenu z NMT 1 m (GUGiK WCS), dla działki + bufor ~300–500 m

1. **Wypełnianie zagłębień** (Planchon & Darboux 2002 lub Wang & Liu 2006) → różnica DEM_filled − DEM
   = **naturalne zagłębienia bezodpływowe**. To kandydaci na oczko wodne lub mały zbiornik (NWRM N01) albo
   odtworzenie mokradła (N02). Raportujemy objętość potencjalnej retencji (m³) i powierzchnię.
2. **Kierunki i akumulacja spływu (D8)** → linie koncentracji spływu przecinające działkę. Tam proponujemy
   **pas buforowy lub trawiasty** (A02), zadrzewienie śródpolne lub **uprawę w poprzek stoku** (A04).
3. **Spadek** → > 5%: przeciwerozyjne i spowalniające odpływ (A04, A08, A13); 2–5%: pasy buforowe;
   < 2% i płaskie obniżenia: mała retencja.
4. **Rowy w pobliżu** (BDOT10k / OSM, ≤ 200 m) → **zastawki / piętrzenie na rowach, sterowany odpływ**
   (przykładowa rekomendacja z zadania: „spowolnienie odpływu wód w rowach melioracyjnych”). Dodajemy informację
   o wymogach prawa wodnego i kontakcie z Wodami Polskimi lub spółką wodną.
5. **Gleby organiczne / torfowe** (IUNG GAEC2) → ochrona przed odwodnieniem, utrzymanie wysokiego poziomu wód gruntowych.

### 3.2 Tabela reguł (fragment – do rozbudowy)

| Warunek (z etapów 1–2) | Rekomendacja | Kod NWRM |
|---|---|---|
| zagłębienie > X m³ w działce lub buforze + częsta susza | oczko wodne / mały zbiornik retencyjny | N01 |
| obniżenie z TWI > p90 + gleba organiczna | ochrona / odtworzenie mokradła | N02 |
| rów ≤ 200 m + przyczyna 2.4 | zastawka, piętrzenie, sterowany odpływ | (N13 / działania WP) |
| spadek > 3% + udział odpływu > 15% | pas buforowy, zadrzewienie, uprawa w poprzek stoku | A02, A04 |
| brak zadrzewień w buforze 500 m + duże pole | zadrzewienie śródpolne / żywopłot (wiatr → mniejsze parowanie) | A02 |

Każda reguła, która się uruchomi, zapisuje w raporcie **„dlaczego”**, np. „W odległości 140 m od działki przebiega rów
melioracyjny (BDOT10k), a gleba jest kat. II – spowolnienie odpływu zatrzyma wodę na dłużej”.

---

## 4. Rekomendacje agrotechniczne (retencja glebowa, ograniczanie strat wilgoci)

| Działanie | Kiedy rekomendować | Uzasadnienie / źródło |
|---|---|---|
| Międzyplony / okrywa zimowa (A08) | gleby I–III, pole puste po zbiorze, przyczyna 2.2 | infiltracja, SOC; NWRM, CDR e‑poradnik 2025 |
| Pozostawianie resztek / mulcz (A13) | wysokie ET0, CDD, gleby lekkie | mniejsze parowanie z powierzchni; FAO‑56 (współczynnik parowania Ke) |
| Uprawa uproszczona / bezorkowa (A06, A07) | gleby lekkie i średnie, spadek > 2% | lepsza struktura i retencja, mniejsza erozja |
| Zwiększanie materii organicznej (obornik, kompost, wapnowanie) | SOC < 1,5%, kat. I–II | **4 per mille** (Minasny i in., 2017). Uwaga: przyrost AWC jest umiarkowany i długoterminowy (Minasny & McBratney, 2018) – nie obiecywać szybkich efektów |
| Uprawa w poprzek stoku, pasy | spadek > 3% | ogranicza spływ (SCS‑CN, wyższe CN przy uprawie wzdłuż stoku) |
| Wczesny siew / dobór odmian i gatunków (A09) | susza powtarzalna w IV–VI | ucieczka przed stresem; progi IUNG pokazują różną wrażliwość upraw |
| Zmiana struktury upraw | kat. I + susza ≥ 5/10 lat dla wybranej uprawy | porównanie częstości przekroczeń progów IUNG dla innych upraw na tej samej glebie, np. „żyto/zboża ozime przekraczały próg 2×, kukurydza 6×” |
| Płytkie wzruszenie po deszczu, ograniczenie przejazdów (A11) | gleby zlewne, kat. III–IV | przerwanie parowania kapilarnego, mniejsze ugniatanie |

**Innowacyjny element:** symulacja „co jeśli” w bilansie glebowym (§1.3). Np. +10% TAW po latach zwiększania SOC
albo −20% parowania pod mulczem → ile dni stresu mniej w ostatnich 10 sezonach. To przekłada naukę na liczby,
które rolnik rozumie.

---

## 5. Nawadnianie (opcjonalne, ale punktowane)

1. **Zasadność:** bilans FAO‑56 (§1.3) + prognoza Open‑Meteo 7–16 dni (opad, ET0).
   - Jeśli `Dr > RAW` teraz lub w prognozie **i** uprawa jest w oknie krytycznym, nawadnianie jest zasadne.
   - Jeśli prognoza daje > 15–20 mm opadu w 3 dni, wstrzymaj (oszczędność wody).
2. **Termin:** dzień, w którym prognozowany `Dr` przekroczy RAW. Podlewać rano lub wieczorem (mniejsze straty na parowanie).
3. **Dawka:** `dawka netto ≈ Dr` (uzupełnienie do polowej pojemności), ograniczona zdolnością gleby: lekkie 15–25 mm,
   średnie 25–35 mm, ciężkie 30–40 mm na zabieg. Dawka brutto = netto / sprawność (kroplowe ~0,9, deszczownia ~0,7–0,75).
4. **Ekonomia wody:** sezonowa potrzeba = Σ(ETc − Peff) w oknie krytycznym, liczona dla każdego z 10 lat →
   „w typowym roku potrzeba ~X mm, w suchym ~Y mm”.
5. **Ograniczenia:** dostępność źródła wody (cieki i wody podziemne w pobliżu), wymogi prawa wodnego (pobór
   ponad zwykłe korzystanie wymaga pozwolenia lub zgłoszenia). Raport zawsze stawia **retencję przed nawadnianiem**,
   zgodnie z logiką KOWR.

Źródła: FAO‑56; CDR Brwinów (2025) e‑poradnik – rozdział o systemach wspomagania decyzji nawodnieniowych; FAO (2019) *Water scarcity management*.

---

## 6. Niepewność, jakość danych, przejrzystość (wymóg 3.3 pkt 5 + kryterium 2)

- **Pewność wyniku (wysoka / średnia / niska)** liczona z:
  - zgodności wskaźników (ile elementów łańcucha z §1.7 wskazuje to samo);
  - liczby czystych scen satelitarnych w oknie (np. < 2 → niska);
  - rozdzielczości danych względem działki (ERA5‑Land 9 km, SoilGrids 250 m, IUNG – kontury mapy glebowej);
  - zakresu niepewności SoilGrids (kwantyle Q0.05–Q0.95 są w API);
  - odległości do najbliższej stacji IMGW (jeśli jej używamy).
- **Brak danych = komunikat**, nie zero: „Brak bezchmurnych zdjęć satelitarnych w okresie 1–20 VI – ocena stanu
  roślin niedostępna”.
- **Bez pozornej precyzji:** zaokrąglenia (KBW do 5 mm, % wody w glebie do 5 pp.), przedziały zamiast liczb tam,
  gdzie dane są zgrubne.
- **Stała sekcja „Czego raport nie uwzględnia”:** nawadniania już stosowanego, drenażu podziemnego, faktycznej
  odmiany i terminu siewu, lokalnych ulew poniżej rozdzielczości reanalizy, poziomu wód gruntowych (jeśli brak danych).
- **Data analizy:** wszystkie pobrania są „cięte” na datę wybraną przez jury (`end_date = data_analizy`), a okno
  historii to `[data_analizy − 10 lat, data_analizy]`. Najstarszy przypadek to analiza z 2016 r. i dane od 2006 r.
  Nic z przyszłości nie wchodzi do wyniku:
  - prognoza: dla daty bieżącej Open‑Meteo Forecast; dla dat historycznych **klimatologia** (średnie P i ET0 na kolejne
    7–14 dni z 10 lat przed datą), z komunikatem „dla dat archiwalnych nie ma prognozy wydanej tego dnia”;
  - dane bez historii (granice ULDK, rowy BDOT10k, NMT, mapa kategorii gleb) w stanie obecnym, z adnotacją w raporcie;
  - raport pokazuje **źródło satelitarne dla każdego roku** (S2 / Landsat / MODIS), bo od tego zależy pewność.

---

## 7. Walidacja (README pkt 4.2.9)

1. **Backtesting na znanych latach suszy w Polsce** (2015, 2018, 2019, 2020 – wiosna). Narzędzie powinno pokazywać suszę
   tam, gdzie SMSR IUNG ją ogłosił, i nie pokazywać jej w latach wilgotnych (np. 2017).
2. **Porównanie z SMSR IUNG** (tabele dla gmin, mapy KBW) i z **EDO CDI** dla tych samych dat → macierz zgodności w README.
3. **Spójność wewnętrzna:** bilans FAO‑56 vs ERA5‑Land SM vs CLMS SWI – korelacja szeregów.
4. **Testy jednostkowe reguł** (każda rekomendacja ma test: wejście → oczekiwana reguła).

---

## 8. Rola AI (wymóg 5.1 – opisać w README)

- **Obliczenia i decyzje: deterministyczne** (reguły + modele fizyczne powyżej). Spełnia to wymóg, że „wynik oblicza
  aplikacja na podstawie danych”, i daje powtarzalność wyników przy ocenie jury.
- **LLM (opcjonalnie) wyłącznie do redakcji** prostego języka z gotowych, policzonych faktów (tzw. grounding:
  model dostaje JSON z wynikami i nie może dodawać liczb). Zawsze jest fallback na szablony tekstowe.
- **ML (opcjonalne rozszerzenie):** model plonu lub stresu (np. gradient boosting na KBW, SPEI, VCI, kategorii gleby)
  trenowany na danych historycznych. Tylko jeśli starczy czasu i da się go uczciwie zwalidować.

---

## 9. Wydajność (< 30 s na działkę)

- Równoległe pobieranie (ULDK → wtedy reszta asynchronicznie): Open‑Meteo 10 lat dziennie to 1 zapytanie (< 1 s).
- Sentinel‑2 za 10 lat to najdroższy element. Opcje:
  a) **Sentinel Hub Statistical API (CDSE)** – jedno zapytanie zwraca szereg statystyk strefowych dla poligonu (konto darmowe, limit jednostek);
  b) STAC + odczyt okienkowy COG (tylko piksele działki), ograniczony do okien wrażliwości upraw i scen z małym zachmurzeniem;
  c) cache wyników per (działka, scena) – dopuszczalny, bo aplikacja dalej sama liczy wynik z pobranych danych (opisać w README).
- NMT 1 m: pobierać tylko bbox działki + bufor (WCS `subset`), max kilka km².

---

## 10. Uprawa wykrywana automatycznie i tryb zależny od daty

**Uprawa (bez pytania rolnika):**
1. Deklaracja ARiMR (GSA) dla działki referencyjnej przecinającej działkę ewidencyjną; bierzemy uprawę o największym udziale powierzchni.
2. Kontrola krzywą NDVI z Sentinel‑2 w bieżącym sezonie: ozime (zielone już w IV), jare (start V), kukurydza (szczyt VII–VIII), użytek zielony (zielony cały sezon). Gdy się zgadza, piszemy „wykryte”; gdy nie, „sprawdź uprawę”.
3. Brak obu źródeł → kafelki do wyboru (jedyny przypadek, gdy pytamy).
4. Lata ubiegłe: GSA (jeśli jest historia), Copernicus Crop Types 2017–2021 (2022–2024 zapowiedziane), JRC EU Crop Map 2018 i 2022. Każdy sezon oceniany progiem IUNG **dla uprawy z tego roku**.
5. **Data analizy w przeszłości:** uprawę „bieżącą” bierzemy dla roku daty analizy, nie dla dziś. Lata bez gotowej mapy upraw (np. 2016, 2023–2024, wszystko < 2017) → klasyfikacja z krzywej NDVI (Sentinel‑2 / Landsat), a gdy niepewna → kafelki do wyboru i adnotacja w raporcie.
6. **Numer działki, którego nie ma w ULDK** (np. podzielona po dacie analizy): komunikat „nie znaleziono działki o tym numerze w obecnej ewidencji — wskaż ją na mapie”; dalsza analiza na geometrii z kliknięcia.

**Tryb zależny od daty analizy D:**

| Okres D | Ocena | Działania |
|---|---|---|
| 21.III–30.IX (sezon progów IUNG) | KBW 60 dni vs próg, zbiornik FAO‑56, satelita | retencja → pole → **nawadnianie teraz** (z prognozą) |
| 1.X–20.III (poza sezonem) | ocena minionego sezonu (czy i kiedy był próg przekroczony) + obecny zapas wody w glebie (ERA5‑Land) | **retencja teraz** (zastawki, zagłębienia, nasadzenia), nie orać na zimę / okrywa, **nawadnianie jako plan** na następny sezon (potrzeba w mm z 10 sezonów: typowy / suchy rok) |
| uprawa bez progu IUNG (łąka, pastwisko, burak na kat. I) | zbiornik FAO‑56 + SPEI, komunikat „brak urzędowego progu” | jak wyżej |
| działka nierolnicza (las, zabudowa, woda – z EGiB / LPIS) | brak oceny rolniczej, komunikat wprost | – |

## Bibliografia (do przeniesienia do README)

**Z materiałów KOWR**
- Allen R.G., Pereira L.S., Raes D., Smith M. – *Crop evapotranspiration*, FAO Irrigation and Drainage Paper 56 (wyd. zrewidowane, 2025).
- Doroszewski A. i in. (2012) – *Podstawy Systemu Monitoringu Suszy Rolniczej*, IUNG‑PIB.
- European Commission (2014) – *Natural Water Retention Measures Policy Document*.
- European Commission (2015) – *A Guide to Support the Selection, Design and Implementation of NWRM in Europe*.
- FAO (2019) – *Water scarcity management: Addressing water scarcity in agriculture and food systems*.
- Minasny B. i in. (2017) – Soil carbon 4 per mille, *Geoderma* 292: 59–86.
- Żyłowska K., Kozyra J. (2025) – *Zintegrowane monitorowanie suszy na potrzeby rolnictwa – przegląd systemów i wskaźników*, IUNG‑PIB.
- Polska Agencja Kosmiczna (2024) – *Dane satelitarne dla administracji publicznej*, rozdz. 6.3.3 i 6.3.4.
- CDR Brwinów (2025) – *Melioracje, retencja i gospodarka wodna w rolnictwie*, e‑poradnik.
- Rozporządzenie MRiRW z 11.04.2019 – wartości progowe KBW (tabela: susza.iung.pulawy.pl/progi/).

**Uzupełniające (metody użyte wyżej)**
- McKee T.B., Doesken N.J., Kleist J. (1993) – SPI, *8th Conf. on Applied Climatology*.
- Vicente‑Serrano S.M., Beguería S., López‑Moreno J.I. (2010) – SPEI, *Journal of Climate* 23: 1696–1718.
- Kogan F.N. (1995) – VCI/TCI, *Advances in Space Research* 15(11): 91–100.
- Gao B.‑C. (1996) – NDWI, *Remote Sensing of Environment* 58: 257–266.
- Beven K.J., Kirkby M.J. (1979) – TOPMODEL / TWI, *Hydrological Sciences Bulletin* 24: 43–69.
- USDA NRCS – *National Engineering Handbook*, Part 630, rozdz. 10 (SCS Curve Number).
- Saxton K.E., Rawls W.J. (2006) – funkcje pedotransferowe, *SSSAJ* 70: 1569–1578 (gdy brak `wv0033/wv1500`).
- Minasny B., McBratney A.B. (2018) – Limited effect of organic matter on soil available water capacity, *Eur. J. Soil Sci.* 69: 39–47.
- Sepulcre‑Canto G. i in. (2012) / Cammalleri i in. (2021) – Combined Drought Indicator (EDO), *NHESS*.
- Ślusarczyk E. (1979) – retencja użyteczna gleb (podstawa kategorii IUNG).

*Szczegółowe liczby z 1.5, 2 i 4 (progi, dawki) to punkty startowe do konsultacji z mentorami
(dr inż. T. Bolewski – bilans wodny; dr hab. D. Gozdowski – agrotechnika i satelity).*
