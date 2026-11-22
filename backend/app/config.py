"""Wszystkie progi ⚙️ w jednym miejscu (T1.5). Wartości startowe z pipeline_plan.md – do kalibracji (T14)."""

# TAW (woda dostępna, mm na 1 m profilu) dla kategorii podatności IUNG – pipeline F6b
WOD_MM = {1: 110.0, 2: 150.0, 3: 185.0, 4: 220.0, 5: 220.0}

# Curve Number (uprawy rzędowe, dobry stan) dla λ = 0,2 wg grupy hydrologicznej ~ kategorii IUNG (METODY §2)
CN_02 = {1: 67, 2: 72, 3: 78, 4: 82, 5: 78}
LAMBDA_CN = 0.05

# Kc poza okresem wegetacji uprawy (goła gleba / resztki, parowanie z powierzchni)
KC_POZA = 0.3

# Scenariusze (etap 3b)
N_SCEN = 10                   # 10 albo 30 – rozstrzyga hindcast (T12.8)
PROG_SUSZA_NADCHODZI = 0.70   # udział przebiegów
PROG_ZAGROZENIE = 0.30

# Przyczyny C1–C6 (pipeline 5.2)
C1_PROGI = [(0.40, 3), (0.55, 2), (0.70, 1)]          # opad / norma
C2_DNI = [(12, 3), (8, 2), (5, 1)]                    # dni > 30°C w 30 dniach
C2_ET0 = 1.15                                         # ET0 60 dni / norma
C3_TAW = 130.0

# Nawadnianie (R7): maks. dawka netto na zabieg wg kategorii gleby
MAX_DAWKA = {1: 20.0, 2: 25.0, 3: 30.0, 4: 35.0, 5: 30.0}
R7_MIN_BRAK = 10.0            # mm

# Efekty działań w scenariuszach (F20)
MULCZ_REDUKCJA_E = 0.25       # −5% parowania na 10% okrycia; 50% okrycia → −25% (FAO‑56)
MULCZ_KC_GRANICA = 0.7        # dni z Kc poniżej tej wartości = parowanie z gleby dominuje

# Stopnie suszy w historii (KBW / próg)
STOPNIE = [(1.30, "skrajna"), (1.15, "silna"), (1.05, "umiark."), (1.0, "lekka")]

# Budżet czasu źródeł podpowiedzi uprawy / kategorii gleby przy wyszukaniu działki (s); proxy frontu czeka 20 s.
BUDZET_KARTY_S = 7.0
# Hydrologia (L3): powyżej tej powierzchni zlewni elementarnej MPHP piętrzenie dotyczy cieku zarządzanego przez
# Wody Polskie, a nie rowu spółki wodnej – zalecenie R1 kieruje wtedy do zarządcy. ⚙️ wartość robocza, do T. Bolewskiego.
ZLEWNIA_DUZA_KM2 = 10.0
# WMS Catchments bywa zwracać też duże dorzecza (np. „Odra” ~10⁵ km²). Powyżej tego progu nie traktujemy
# wyniku jako zlewni elementarnej przy rowie. ⚙️ typowa zlewnia elementarna MPHP to pojedyncze–kilkadziesiąt km².
ZLEWNIA_ELEMENTARNA_MAX_KM2 = 100.0
BUDZET_MPHP_S = 12.0          # usługa Wód Polskich bywa wolna (zmierzone 2,6–11,7 s); wynik w cache bez terminu

# Budżet czasu źródeł kontekstowych analizy (EDO, SoilGrids, mapa upraw, prognoza) – wolna usługa nie trzyma raportu (s).
BUDZET_KONTEKST_S = 8.0

# Usługa, która w ogóle nie odpowiada (nie przyjmuje połączenia), ma odpaść szybko, a nie po 15–40 s: czas na
# nawiązanie połączenia z każdym zewnętrznym źródłem (s). Czas na samą odpowiedź zostaje dłuższy, bo np. Sentinel Hub
# liczy obraz kilka sekund, zanim cokolwiek odeśle.
TIMEOUT_POLACZENIA_S = 3.0
# Cały łańcuch zdjęć satelitarnych (Sentinel Hub → Planetary Computer → Landsat). Bez limitu potrafił trzymać raport
# ponad minutę, gdy kolejne zapasowe usługi nie odpowiadały. Zmierzone działające pobranie: 3–6,5 s na zimno,
# szybciej z cache; 5 s to kompromis — przy wolnym, ale działającym Sentinel Hub raport czasem pójdzie bez satelity.
BUDZET_SATELITA_S = 5.0

# Podział działki na części uprawne (czesci.py). Skrawek poniżej tych progów to zwykle niedokładność granic
# deklaracji ARiMR względem ewidencji, a nie osobna uprawa – dołączamy go do reszty działki.
CZESC_MIN_HA = 0.10
CZESC_MIN_UDZIAL = 0.03
# Poniżej tego udziału nieobsadzona reszta działki nie jest pokazywana jako osobna część.
RESZTA_MIN_UDZIAL = 0.05
