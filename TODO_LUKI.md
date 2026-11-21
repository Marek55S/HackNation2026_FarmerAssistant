# TODO – luki względem polecenia KOWR

Cel: domknąć miejsca, w których prototyp nie spełnia wprost treści zadania („KOWR – Pełna treść zadania konkursowego.pdf”).
Każde zadanie ma: wymaganie z polecenia, stan dziś (z odwołaniem do kodu), kroki, kryterium „zrobione”.
Ogólny plan prac: [TODO.md](TODO.md). Logika: [pipeline_plan.md](pipeline_plan.md), metody: [METODY.md](METODY.md).

Nakład: S < 1 h, M 2–4 h, L > 4 h. Stan na 21.11.2026.

## Kolejność i zależności

| # | Zadanie | Nakład | Zależy od |
|---|---|---|---|
| L1 | Satelita czytany względem uprawy | M | – |
| L2 | Bilans wody w glebie z uprawą z danego roku | M | – |
| L3 | Dane hydrologiczne, które zmieniają zalecenia | M–L | – |
| L4 | Raport: stan → podatność → scenariusze, bez pozornej precyzji | M | L2 (zmienią się liczby historii) |
| L5 | README: punkty 4.2 i 5.5 | M | wszystkie (opisuje stan końcowy) |

**Stan realizacji (21.11.2026, wieczór):** L1–L5 zrobione w kodzie i dokumentacji; testy `backend/tests/test_luki.py`. Niezweryfikowane: czas analizy bez cache po zmianach (dzienny limit Open‑Meteo wyczerpany przy testach) i potwierdzenia ⚙️ od mentorów.

L1, L2 i L3 można robić równolegle. Po L1 i L3 obowiązkowo zmierzyć czas analizy bez cache (cel < 30 s, dziś 23,5 s).

Wspólna zasada dla wszystkich zadań: brak danych komunikujemy wprost w `braki` (wymóg 3.3 pkt 5), niczego nie zgadujemy.

## Decyzje (21.11.2026)

| Temat | Decyzja |
|---|---|
| L1: jak porównywać uprawy w NDMI | **grupy łanu**: zboża (ozime + jare), kukurydza, rzepak, okopowe (ziemniak + burak), użytki zielone; „inna” nie ma grupy |
| L1: 1–2 lata odniesienia | **nie pokazujemy** mapy „Gdzie sucho” ani sygnału satelity; raport mówi, że jest za mało sezonów z tą samą uprawą |
| L3: ostrzeżenia IMGW bez warstwy zlewni prognostycznych | **dopasowanie po województwie**, w raporcie oznaczone „ostrzeżenie dla regionu” z opisem zlewni z komunikatu |
| L4: kolejność sekcji raportu | **zmieniamy względem makiety**: stan → podatność 10 lat → przyczyny → plan → scenariusze; komponenty i wygląd bez zmian |

Otwarte, do mentorów (⚙️):
- **dr Gozdowski:** potwierdzenie grup łanu (L1). Do tego czasu obowiązuje podział z tabeli.
- **T. Bolewski:** od jakiej powierzchni zlewni piętrzenie to sprawa zarządcy, a nie rolnika (L3).

---

## L1. Satelita czytany względem uprawy

**Wymaganie (3.2 pkt 1a):** „Interpretacja danych satelitarnych powinna uwzględniać rodzaj uprawy i specyfikę analizowanej roślinności.”

**Stan dziś:**
- Anomalię NDMI liczymy względem tych samych dni w poprzednich latach, bez sprawdzenia, co wtedy rosło:
  - Sentinel Hub: [cdse.py:235-237](backend/app/cdse.py#L235-L237) (`lata = range(koniec.year - 1, 2014, -1)[:9]`),
  - Planetary Computer: [satellite.py:112](backend/app/satellite.py#L112),
  - Landsat: [satellite.py:223](backend/app/satellite.py#L223).
- Przy płodozmianie pszenica 2026 jest porównywana np. z rzepakiem 2025 albo kukurydzą 2023, więc z-score mierzy różnicę roślin, a nie suszę.
- Poza sezonem okno sceny to okno wrażliwe **bieżącej** uprawy w minionym sezonie ([analysis.py:233-235](backend/app/analysis.py#L233-L235)), choć w minionym sezonie mogła rosnąć inna roślina.
- Historia upraw per rok jest już dostępna przed wywołaniem satelity: `wcl` (CLMS 2017–2024) i `wa` (ARiMR tylko dla `D.year`), [analysis.py:186-198](backend/app/analysis.py#L186-L198).

**Kroki:**
1. **Grupy upraw** w [crops.py](backend/app/crops.py): słownik `GRUPA = {"pszenica": "zboża", "jare": "zboża", "kukurydza": "kukurydza", "rzepak": "rzepak", "ziemniak": "okopowe", "burak": "okopowe", "laka": "użytki zielone", "inna": None}`. Porównujemy w obrębie grupy, bo o podobieństwie NDMI decyduje typ łanu, a nie gatunek. Uprawa „inna” nie ma grupy, więc dla niej satelita zawsze zwraca „brak porównania”. Decyzja z 21.11, ⚙️ do potwierdzenia z dr. Gozdowskim.
2. **Uprawa dla każdego roku** w [analysis.py](backend/app/analysis.py): wydzielić funkcję `uprawa_roku(rok) -> Uprawa | None`. Kolejność źródeł jak w historii ([analysis.py:292-299](backend/app/analysis.py#L292-L299)): ARiMR dla danego roku, potem CLMS przez `_clms_rok`, w przeciwnym razie `None`, czyli rok nieznany. Tej samej funkcji użyje L2.
3. **ARiMR za rok poprzedni:** dziś `sources.arimr_uprawa` jest wołane tylko dla `D.year`, a CLMS kończy się na 2024. Przy `D` w 2026 rok 2025 jest nieznany. Dodać do `asyncio.gather` drugie wywołanie `arimr_uprawa(client, rings, D.year - 1)`. Usługa WFS obsługuje 2025 i 2026 ([sources.py:167](backend/app/sources.py#L167)).
4. **Filtr lat odniesienia:** do `cdse.ndmi_anomalia_sh`, `satellite.ndmi_anomalia` i `satellite.ndmi_landsat` dodać parametr `lata_ok: set[int] | None`. Do odniesienia brać tylko lata z tej samej grupy co uprawa w roku sceny. Lata nieznane pomijać.
5. **Okno sceny poza sezonem:** okno wrażliwe brać z uprawy roku `y_s` (`uprawa_roku(y_s)`), a nie z `u`. Gdy `y_s` jest nieznany, zostawić okno `u` i dopisać brak: „nie wiemy, co rosło w {y_s}, przyjęto okno bieżącej uprawy”.
6. **Goła gleba:** pomijać rok odniesienia (i rok sceny), w którym `kc_dnia(uprawa_roku(y), dzień_sceny)` daje „poza wegetacją”. Wtedy NDMI mierzy glebę lub resztki, a nie rośliny. Dla sceny z bieżącego roku: komunikat „pole bez roślin w tym okresie – satelita nie ocenia stanu roślin”, a sygnał satelity jest `None`.
7. **Za mało lat:** gdy po filtrze zostają mniej niż 3 lata, nie liczyć z-score dla wszystkich lat. Zwrócić `Wynik(..., powod="za mało sezonów z tą samą grupą upraw do porównania ({n} < 3)")`.
   - W raporcie sygnał „rośliny z satelity” = `None`, więc wypada z liczenia pewności ([analysis.py:677](backend/app/analysis.py#L677)).
   - Mapa „Gdzie sucho” się nie pokazuje (decyzja z 21.11).
   - R7/R8 wracają wtedy do „cała działka”, bo nie ma `strefa` ([analysis.py:409-412](backend/app/analysis.py#L409-L412)).
   - Na froncie warstwa „sucho” ma być nieaktywna, a nie pusta. Przy braku `sucho` w `surowe` przełącznik warstwy z opisem „brak porównania satelitarnego” (sprawdzić w [parcel-map.tsx](frontend/src/components/report/parcel-map.tsx)).
   - **Ryzyko:** mapa upraw CLMS ma od niedawna limit czasu `C.BUDZET_KONTEKST_S` ([analysis.py:193](backend/app/analysis.py#L193)). Gdy nie zdąży, wszystkie lata 2017–2024 są „nieznane” i satelita wypada z raportu. W `braki` napisać wtedy przyczynę („mapa upraw nie odpowiedziała – bez porównania satelitarnego”), a nie tylko „za mało lat”.
8. **Raport:** w `szczegoly` ([analysis.py:722-726](backend/app/analysis.py#L722-L726)) wypisać lata odniesienia z uprawami, np. „porównanie z sezonami 2019, 2021, 2023 (zboża)”. Do wyniku satelity dodać pole `uprawy_ref`.
9. **Testy** w [backend/tests/test_core.py](backend/tests/test_core.py): funkcja filtra lat (grupa, lata nieznane, goła gleba, < 3 lata) na danych syntetycznych, bez sieci.

**Zrobione, gdy:**
- dla działki z płodozmianem w szczegółach widać tylko lata z tą samą grupą upraw;
- przy < 3 takich latach raport mówi to wprost, a sygnał satelity nie wpływa na pewność;
- czas analizy bez cache nadal < 30 s (filtr zmniejsza liczbę zapytań, dodatkowe ARiMR je zwiększa).

---

## L2. Bilans wody w glebie z uprawą z danego roku

**Wymaganie:**
- 3.3 pkt 4: ocena historycznej podatności działki z danych wieloletnich;
- 3.2 pkt 1a: uwzględnić rodzaj uprawy.

**Stan dziś:**
- Ciągły bilans FAO-56 liczy 31 lat z **bieżącą** uprawą `u` ([analysis.py:279](backend/app/analysis.py#L279)).
- Z niego biorą się dni stresu i niedobór w historii ([analysis.py:304-309](backend/app/analysis.py#L304-L309)). Maska okna wrażliwego też pochodzi z bieżącej uprawy (`okno_mask`).
- KBW w historii bierze już uprawę z danego roku ([analysis.py:292-299](backend/app/analysis.py#L292-L299)). Dwie części tej samej historii zakładają więc różne uprawy.
- Wpływ na zapas wody na dzień D (F4) jest mały, bo bilans „zapomina” po sezonie. Wpływ na kafelki historii i na „dni stresu” jest duży.

**Kroki:**
1. **Sygnatura `bilans`** w [facts.py:130](backend/app/facts.py#L130): obok `u: Uprawa` przyjąć `u_roku: Callable[[int], Uprawa] | None`. W pętli `uu = u_roku(dni[t].year) if u_roku else u`. Z `uu` liczyć `kc_dnia`, `w_oknie`, `RAW = uu.p * TAW_r` i `ks`. Scenariusze (`scenariusze`, `zysk`) zostają na `u`, bo dotyczą przyszłego sezonu z uprawą wybraną przez rolnika.
2. **TAW zależy od korzeni:** `TAW = WOD_MM[kat] * min(zr, 1.0)` ([analysis.py:274](backend/app/analysis.py#L274)) zależy od `uu.zr`. Liczyć `TAW_r` per rok. Na przełomie lat przyciąć `d_r = min(d_r, TAW_r)`, żeby deficyt nie przekroczył nowej pojemności.
3. **Lata nieznane:** `u_roku` zwraca bieżącą uprawę, czyli tak jak dziś. Kafelek historii ma już dopisek „przyjęto bieżącą uprawę” (`uprawa_zr`).
4. **Okno wrażliwe w historii:** `okno_mask` liczyć per dzień z `w_oknie(u_roku(dd.year), dd)`. Wtedy `brak_okno` dotyczy okna rośliny, która wtedy rosła.
5. **Uprawy ozime:** sprawdzić, że `kc_dnia` dla ozimin (start 1.03 = ruszenie wegetacji) daje sensowny przebieg w roku, w którym po ozimej przyszła np. kukurydza. Jesienny wysiew kolejnej uprawy pomijamy (Kc poza wegetacją = 0,3, jak dziś) i dopisujemy to do ograniczeń w README.
6. **Testy:** dwa lata syntetyczne z różnymi uprawami (inne `p` i `zr`); sprawdzić, że RAW i stres zmieniają się 1 stycznia, a ciągłość `Dr` jest zachowana.

**Zrobione, gdy:**
- dni stresu i KBW w każdym kafelku historii opisują tę samą uprawę;
- tooltip kafelka podaje źródło uprawy dla obu wartości;
- testy przechodzą.

---

## L3. Dane hydrologiczne, które zmieniają zalecenia

**Wymaganie:**
- 3.2 pkt 2a: zalecenia na podstawie m.in. „cieków i zbiorników wodnych (danych hydrologicznych)”;
- 3.3: kategoria „dane hydrologiczne”.

**Stan dziś:**
- Jedynym źródłem jest BDOT10k, czyli odległość i typ rowu ([bdot.py](backend/app/bdot.py)).
- R1 mówi wprost: „efektu nie liczymy w scenariuszach (brak danych o zlewni rowu)” ([analysis.py:480](backend/app/analysis.py#L480)).

**Zasada:** dodajemy tylko to, co zmienia fakt albo zalecenie. Sama warstwa „do obejrzenia” się nie liczy.

**Źródła sprawdzone 21.11.2026:**

| Źródło | Zapytanie | Co zwraca |
|---|---|---|
| MPHP10k (Wody Polskie), WMS INSPIRE | `https://wody.isok.gov.pl/wss/INSPIRE/INSPIRE_HY_10k_2019_WMS?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=HY.PhysicalWaters.Catchments&QUERY_LAYERS=HY.PhysicalWaters.Catchments&CRS=EPSG:4326&BBOX={lat-0.01},{lon-0.01},{lat+0.01},{lon+0.01}&WIDTH=101&HEIGHT=101&I=50&J=50&INFO_FORMAT=application/json&FEATURE_COUNT=1&STYLES=` | zlewnia elementarna: `gn_spelling` (np. „Cisownik do dopł. z Uzewnika (p)”), `hy_localid`, **poligon** |
| IMGW hydro (bieżące) | `https://danepubliczne.imgw.pl/api/data/hydro/` | ok. 800 wodowskazów: `lon`, `lat`, `rzeka`, `stan_wody`, `stan_ostrzegawczy`, `stan_alarmowy`, `przeplyw`, daty pomiaru |
| IMGW ostrzeżenia | `https://danepubliczne.imgw.pl/api/data/warningshydro` | `zdarzenie` („Susza hydrologiczna”, „Wezbranie…”), `przebieg`, `data_od`/`data_do`, `obszary[].kod_zlewni` (np. `Z_P_LD_1816`), `obszary[].wojewodztwo` |

WFS MPHP (`…_WFS`, `GetFeature`) przekierowuje na logowanie. Używamy WMS `GetFeatureInfo`.

**Kroki:**
1. **Nowy moduł `backend/app/hydro.py`.**
   - Wszystkie wywołania przez `net.get` (cache, czas pobrania, `Wynik`) z timeoutem 5 s.
   - W [analysis.py](backend/app/analysis.py) dodać je do pierwszego `asyncio.gather`, owinięte w istniejące `_w_czasie(…, nazwa, C.BUDZET_KONTEKST_S)` (tak jak EDO i SoilGrids, [analysis.py:191-195](backend/app/analysis.py#L191-L195)). Wtedy wolna usługa nie trzyma raportu.
   - Listę wodowskazów i ostrzeżeń IMGW cache'ować krótko (⚙️ 30 min), bo dotyczą całego kraju, a nie działki. Jedno pobranie obsługuje wszystkich użytkowników, co jest też argumentem do sekcji 5.5 w README.
2. **Zlewnia (MPHP):** `zlewnia(client, lon, lat) -> Wynik` z polami nazwa, id, powierzchnia km² (z poligonu przez `geo.area_m2`).
   - W R1: zamiast „brak danych o zlewni rowu” pisać „rów w zlewni {nazwa}, ok. {X} km² (MPHP)”.
   - MPHP to zlewnia elementarna cieku, czyli przybliżenie zlewni rowu. Napisać to w raporcie.
   - ⚙️ Próg z mentorem (T. Bolewski): powyżej jakiej powierzchni zlewni piętrzenie to sprawa zarządcy (Wody Polskie), a nie rolnika ze spółką wodną. Wtedy R1 zmienia treść na „zgłoś propozycję zarządcy”.
3. **Wodowskaz (IMGW, tylko gdy D jest najwyżej 2 dni przed dziś):**
   - najbliższa stacja w promieniu ⚙️ 30 km; jeśli BDOT zna nazwę cieku, preferować stację na tym samym cieku;
   - do `fakty` i `szczegoly`: rzeka, odległość, stan, data pomiaru;
   - dla dat archiwalnych: brak wprost („stan rzek tylko dla dat bieżących”). Archiwum dobowe IMGW to zadanie na później (T3.13).
   - API nie podaje SNQ ani stanu niskiego, więc samym wodowskazem nie oceniamy niżówki. Ocenę daje krok 4.
4. **Ostrzeżenie „Susza hydrologiczna” (IMGW):**
   - Dokładne dopasowanie przez `kod_zlewni` wymaga warstwy zlewni prognostycznych IMGW. Na sprawdzenie, czy jest publiczna (WMS/GeoJSON), dać sobie maksymalnie 30 min.
   - **Jeśli nie ma (decyzja z 21.11): dopasowanie po województwie.**
     - Województwo działki bierzemy z ULDK (`d["wojewodztwo"]`, już jest w wyniku).
     - Brać tylko ostrzeżenia z `zdarzenie == "Susza hydrologiczna"`, gdzie `data_od ≤ D ≤ data_do` i województwo działki jest w `obszary[].wojewodztwo`.
     - W raporcie: „Ostrzeżenie IMGW dla regionu: {obszary[].opis} ({przebieg}), od {data_od}”.
     - Napisać wprost, że dotyczy zlewni w województwie, a nie musi dotyczyć cieku przy działce.
   - Ostrzeżenia są tylko bieżące, więc dla dat archiwalnych: brak wprost, jak przy wodowskazie.
   - **Wpływ na zalecenia:**
     - R7/R8 (nawadnianie): przy aktywnym ostrzeżeniu dopisek „przepływy w regionie poniżej SNQ – nie planuj poboru wody z cieku, sprawdź studnię lub zbiornik”;
     - R1/R2: retencja dostaje wyższy priorytet (np. trafia do „pilne”).
5. **Źródła i licencje:** każde nowe źródło w `zrodla`, `zrodla_chips` i w [ZRODLA_DANYCH.md](ZRODLA_DANYCH.md) §5 i §8.
6. **Testy:** parsowanie odpowiedzi MPHP i IMGW na zapisanych przykładach JSON (bez sieci); wybór najbliższej stacji; zachowanie przy timeoucie (zalecenie bez hydrologii plus brak w `braki`).

**Zrobione, gdy:**
- R1 nie mówi już „brak danych o zlewni”;
- przy ostrzeżeniu o suszy hydrologicznej zmienia się treść zalecenia nawadniania;
- przy niedostępnej usłudze raport działa i mówi, czego brakuje;
- czas bez cache < 30 s.

---

## L4. Raport: stan → podatność → scenariusze, bez pozornej precyzji

**Wymaganie (3.3 pkt 4–5):**
- raport podaje bieżącą sytuację wodną i historyczną podatność, stan niedoboru wody i jego przyczyny;
- poziom niepewności;
- „brak danych komunikowany wprost, bez pozornej precyzji”.

**Stan dziś:**
- Poza sezonem nagłówek to scenariusz na przyszły rok: „Sezon 2027: ryzyko stresu w lipcu 10 na 10 — z planem 10 na 10” ([analysis.py:657-658](backend/app/analysis.py#L657-L658)). Stan na dzień D jest dopiero niżej.
- Gdy plan nie zmienia ryzyka, raport wygląda, jakby zalecenia nic nie dawały.
- Pewność („średnia”) opisuje zgodność sygnałów na dziś ([analysis.py:671-681](backend/app/analysis.py#L671-L681)), a stoi obok ryzyka z przyszłości. Czytelnik łączy jedno z drugim.

**Kroki:**
1. **Nagłówek = stan na dzień D,** w obu trybach. Poza sezonem: `head` z zapasu wody i sygnałów, np. „Dziś w glebie {F4}% wody dostępnej — suszy teraz nie ma”. `sub` = podatność z historii: „W {F5} z 10 ostatnich sezonów brakowało wody, najczęściej w {miesiące}” (`F5` i `mies` już są, [analysis.py:321-323](backend/app/analysis.py#L321-L323)). Scenariusz „Sezon {rok}” przenieść do sekcji ryzyka (`fut_head`, `fut_say`). W sezonie obecny nagłówek zostaje, bo dotyczy najbliższych 2 tygodni i stanu.
2. **Język częstości zamiast ułamków:** „w 10 z 10 sezonów” zamiast „10 na 10”. Nigdzie w tekstach nie pokazywać F4 i F4p jako ułamków z trzema miejscami po przecinku. W [raport_front.py](backend/app/raport_front.py) są już zaokrąglane do %, więc sprawdzić `szczegoly`.
3. **Efekt planu w liczbach** w `fut_say` ([analysis.py:664-668](backend/app/analysis.py#L664-L668)):
   - obok liczby scenariuszy podać różnicę `brak_med` (mm wody w oknie wrażliwym) i `dni_stresu_sr` bez planu i z planem. Oba pola zwraca już `scenariusze()`;
   - gdy `plan_s["ryzyko"] == base["ryzyko"]`, napisać wprost: „Te działania nie usuną ryzyka {miesiąc} na tej glebie (zysk ok. {X} mm); zmienić je może nawadnianie (R8) albo inna uprawa (R9)”. Odwołać się do zaleceń, które są w raporcie.
4. **Jedno zdanie o pewności** pod nagłówkiem: „Pewność {poziom}: {k} z {n} sygnałów zgodnych ({lista}); dotyczy stanu na {data}”. Dane już są w `confidence` ([raport_front.py:324](backend/app/raport_front.py#L324)).
5. **Kolejność sekcji w UI** ([report-screen.tsx](frontend/src/components/report/report-screen.tsx), `AgriReport`):
   - kolejność: stan i pewność → podatność z 10 lat (kafelki historii, dziś w `justification.history`) → przyczyny → plan działań → scenariusze;
   - decyzja z 21.11: kolejność odchodzi od makiety [makieta-ui/](makieta-ui/). Komponenty, style i teksty sekcji zostają, zmieniamy kolejność i nagłówek;
   - w [makieta-ui/README.md](makieta-ui/README.md) dopisać jedno zdanie, że kolejność sekcji raportu w aplikacji jest celowo inna (struktura polecenia KOWR). Inaczej następna osoba „naprawi” ją z powrotem;
   - jeśli kontrakt [types.ts](frontend/src/lib/types.ts) potrzebuje nowego pola (np. `vulnerability`), dodać je w `do_raportu` i w typach jednocześnie.
6. **Wydruk / PDF:** sprawdzić, że nowa kolejność jest taka sama na wydruku (`@media print` w [globals.css](frontend/src/app/globals.css)).
7. **Visual QA** (skill `visual-qa`): ten sam raport w trybie poza sezonem (np. działka `061104_2.0001.100`, D = dziś, pszenica) i w sezonie (`041005_5.0008.57/11`, 2018-07-15, kukurydza), na telefonie i desktopie.

**Zrobione, gdy:**
- pierwsze zdanie raportu odpowiada na pytanie „jaka jest sytuacja wodna działki w dniu D”;
- drugie mówi, jak często w 10 latach brakowało wody;
- scenariusze są opisane jako „jak bywało”, a efekt planu jest podany w mm i dniach albo raport mówi, że go nie ma.

---

## L5. README: punkty 4.2 i 5.5

**Wymaganie:** 4.2 pkt 1–9 i 5.5 (skalowalność). README jest elementem obowiązkowym zgłoszenia.

**Stan dziś:** [README.md](README.md) ma uruchomienie, tabelę funkcji i strukturę. Brakuje punktów 4–9 i 5.5. Część treści jest w innych plikach. Sekcja „Struktura” ma nieaktualne zdanie „frontend… (na razie dane przykładowe)”.

**Kroki (każdy punkt jako osobna sekcja README):**

| Pkt | Sekcja | Skąd wziąć treść |
|---|---|---|
| 4.2.2 | Funkcje | obecna tabela + L1–L4 |
| 4.2.3 | Architektura | struktura katalogów + schemat: front (Next.js) → proxy API → FastAPI → źródła; cache dyskowy `backend/.cache` |
| 4.2.4 | Źródła i zakresy danych | [ZRODLA_DANYCH.md](ZRODLA_DANYCH.md) §0–6 (zasięg czasowy: pogoda 31 lat, historia 10 sezonów, satelita od 2015, Landsat wcześniej, CLMS 2017–2024, ARiMR 2025–2026) |
| 4.2.5 | Na bieżąco vs wcześniej | **wcześniej:** tylko `dane/kbw_progi_iung.csv` (data pobrania + źródło: Rozp. MRiRW 2019); **na bieżąco:** wszystko inne przy każdej analizie (cache przyspiesza powtórki, nie zmienia sposobu liczenia); NMT 1 m pobierany w tle |
| 4.2.6 | Biblioteki, usługi, AI | `backend/requirements.txt`, `frontend/package.json`; AI: zalecenia z reguł deterministycznych ([pipeline_plan.md](pipeline_plan.md) §0), bez LLM w wyniku; AI użyte przy tworzeniu kodu (Claude Code); mapa upraw CLMS to produkt ML Copernicusa |
| 4.2.7 | Licencje | [ZRODLA_DANYCH.md](ZRODLA_DANYCH.md) §8 + nowe źródła z L3 |
| 4.2.8 | Ograniczenia | rozdzielczość ERA5-Land ok. 9 km; teren, rowy i granice w stanie obecnym także dla dat archiwalnych; progi ⚙️ niekalibrowane z mentorami; uprawa przyjęta, gdy brak danych o roku; stan rzek tylko dla dat bieżących; jesienny wysiew pomijany w bilansie (L2 krok 5) |
| 4.2.9 | Weryfikacja | testy jednostkowe (`python -m pytest -q`) + ręczne sprawdzenie działek z kilku regionów w latach znanych (susza 2018, mokry 2017) z tabelą wyników; opcjonalnie porównanie flag suszy z tabelami SMSR IUNG dla gmin (`susza.iung.pulawy.pl/wykazy/{rok},{TERYT7}/`) |
| 5.5 | Skalowalność | cache per region dla źródeł niezależnych od działki (pogoda w siatce 0,05°, EDO, SMSR, IMGW), limity API (Open-Meteo, Sentinel Hub), aktualizacja danych, szacunek kosztów hostingu; płatne warstwy i alternatywy z [USLUGI_Z_KONTEM.md](USLUGI_Z_KONTEM.md) |

Dodatkowo:
- poprawić nieaktualne zdanie w sekcji „Struktura”;
- usunąć z tabeli wiersz „Asystent Zapytaj (MOCK)” albo przenieść go do „Rozwój”, bo nie ma go w UI;
- zaktualizować status zadań w [TODO.md](TODO.md) (np. T10.1 jest zrobione).

**Zrobione, gdy:** każdy z punktów 4.2.1–4.2.9 i 5.5 ma w README własną sekcję, a liczby w README zgadzają się z kodem po L1–L4.
