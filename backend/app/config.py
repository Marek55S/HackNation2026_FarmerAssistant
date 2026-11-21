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
# Budżet czasu źródeł kontekstowych analizy (EDO, SoilGrids, mapa upraw, prognoza) – wolna usługa nie trzyma raportu (s).
BUDZET_KONTEKST_S = 8.0
