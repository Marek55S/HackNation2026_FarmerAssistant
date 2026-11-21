// Example report data taken from the UI mockup (makieta-ui/Raport.dc.html).
// Two variants: in-season (watering now) and off-season (retain water for next year).

import { historyWindow, longDate, seasonOf, shortDate } from "../dates";
import type { Action, ActionId, Cause, CropId, DroughtTag, MapLayer, Report, SeasonHistory } from "../types";
import { cropById, findParcelById, DEMO_PARCEL_ID } from "./parcels";

const BASE_ACTIONS: Action[] = [
  {
    id: "zastawka", n: 1, cat: "ret", x: 93.5, y: 11, layer: "teren",
    title: "Zastawka na rowie", short: "Zastawka na rowie R-3",
    where: "rów R-3 przy północno-wschodnim rogu", when: "jesienią, przed zimą",
    cause: "rowem ucieka woda z wiosny",
    gain: "na wiosnę gleba startuje pełniejsza; ryzyko w czerwcu 4/10 → 3/10",
    why: "Rów (BDOT10k) biegnie 15 m od działki i odprowadza wodę z ok. 40 ha. Piętrzenie od jesieni zatrzyma wodę z roztopów, której w lipcu brakuje na lekkiej glebie.",
    chips: ["koszt niski", "spowolnienie odpływu (NWRM)", "zgłoszenie wodnoprawne"],
  },
  {
    id: "niecka", n: 2, cat: "ret", x: 78.7, y: 22.5, layer: "teren",
    title: "Zatrzymaj wodę w zagłębieniu", short: "Woda w zagłębieniu (NE)",
    where: "najniższy róg pola (NE), ok. 0,15 ha", when: "po zbiorze",
    cause: "tu spływa deszcz z 70% pola",
    gain: "ok. 300 m³ na lipiec — jedna dawka 20 mm dla 1,5 ha",
    why: "Model terenu (1 m) pokazuje zagłębienie bez odpływu — zmieści ok. 300 m³. W 9 z 10 sezonów było tu wilgotniej niż na reszcie pola.",
    chips: ["ok. 300 m³", "NWRM N01", "możliwe dofinansowanie"],
  },
  {
    id: "drzewa", n: 3, cat: "ret", x: 85.5, y: 80, layer: "teren",
    title: "Pas trawy lub drzew", short: "Pas trawy lub drzew (wschód)",
    where: "wschodni skraj pola, pas 6–10 m", when: "od jesieni",
    cause: "stok do 7% — woda z ulew ucieka",
    gain: "o ok. 30–50% mniej wody ucieka z ulew na wschodzie",
    why: "Przy ulewach ok. 18% deszczu spływa tu z pola (NMT + metoda SCS-CN). Pas spowolni spływ, zatrzyma glebę i osłoni pole od wiatru.",
    chips: ["pas 6–10 m", "NWRM A02", "ekoschematy"],
  },
  {
    id: "miedzyplon", n: 4, cat: "agro", x: 33, y: 52, layer: "gleba",
    title: "Międzyplon i resztki po zbiorze", short: "Międzyplon po zbiorze",
    where: "całe pole", when: "wrzesień, zaraz po zbiorze",
    cause: "lekka gleba, mało próchnicy",
    gain: "średnio 6 dni stresu mniej w sezonie (w 7 z 10 scenariuszy)",
    why: "Gleba kat. I–II (IUNG), ok. 0,9% węgla (SoilGrids). Okrywa i resztki poprawią wsiąkanie wody i ograniczą parowanie.",
    chips: ["cała działka", "NWRM A08", "efekt w 2–3 lata"],
  },
  {
    id: "woda", n: 5, cat: "irr", x: 74.5, y: 62, layer: "sucho",
    title: "Podlej 25 mm", short: "Podlej 25 mm — wschód",
    where: "wschodnia część, ok. 1,6 ha", when: "do piątku 17.07, rano lub wieczorem",
    cause: "najsuchsza część pola, kukurydza kwitnie",
    gain: "stres do połowy sierpnia: 9/10 → 2/10 scenariuszy",
    why: "Zapas wody w glebie (24%) jest poniżej progu stresu, a prognoza na 7 dni daje tylko 3 mm. W kwitnieniu brak wody najbardziej obniża plon.",
    chips: ["25 mm netto", "ok. 450 m³", "bilans FAO-56 + prognoza"],
  },
];

const OFF_SEASON: Partial<Record<ActionId, Partial<Action>>> = {
  zastawka: {
    when: "teraz, przed zimą (do połowy grudnia)", cause: "rowem ucieka woda z roztopów",
    gain: "ryzyko w czerwcu: 4/10 → 3/10; szac. 2–4 tys. m³ wody zatrzymanej w rowie",
    why: "Rów (BDOT10k) biegnie 15 m od działki i odprowadza wodę z ok. 40 ha. Zastawka postawiona teraz zatrzyma wodę z zimy i roztopów — tej wody zabrakło w czerwcu i lipcu.",
  },
  niecka: {
    when: "teraz lub wczesną wiosną",
    why: "Model terenu (1 m) pokazuje zagłębienie bez odpływu — zmieści ok. 300 m³. Woda z roztopów może tu stać do maja i zasilać glebę wokół.",
  },
  drzewa: { when: "sadzenie: listopad lub marzec" },
  miedzyplon: {
    title: "Zostaw resztki, nie orz na zimę", short: "Zostaw resztki na zimę",
    when: "teraz — pole po zbiorze kukurydzy",
    gain: "mniej parowania wiosną: średnio 4 dni stresu mniej w kolejnym sezonie",
    why: "Gleba kat. I–II (IUNG), ok. 0,9% węgla (SoilGrids). Rozdrobnione resztki kukurydzy na powierzchni zatrzymają śnieg i ograniczą parowanie wiosną. W przyszłym sezonie po zbiorze: międzyplon.",
    chips: ["cała działka", "NWRM A13 / A08", "koszt: brak"],
  },
  woda: {
    title: "Przygotuj nawadnianie na lato", short: "Plan nawadniania na lato",
    when: "plan teraz, podlewanie czerwiec–lipiec",
    cause: "w 5 z 10 scenariuszy zabraknie wody w lipcu",
    gain: "ryzyko strat w lipcu 5/10 → 1/10; zagłębienie (2) pokryje ok. 1/3 potrzeb",
    why: "Scenariusze z 10 sezonów: w typowym roku kukurydza na wschodzie będzie potrzebować ok. 60 mm dodatkowej wody, w suchym ok. 110 mm. Teraz nie podlewaj — gleba odbudowuje zapas.",
    chips: ["60–110 mm / sezon", "ok. 1000–1800 m³", "sprawdź źródło wody i pozwolenie"],
  },
};

const CAUSES: Cause[] = [
  { name: "Mało deszczu", evidence: "od maja 74 mm zamiast ok. 140 mm normy · SPEI −1,7", level: "główna", icon: "rain", color: "#2a78d6", layer: null },
  { name: "Lekka, piaszczysta gleba", evidence: "kat. I–II IUNG — mały „zbiornik” na wodę, zwłaszcza na wschodzie", level: "duża", icon: "sand", color: "#C9A46B", layer: "gleba" },
  { name: "Upał", evidence: "9 dni ponad 30°C w ostatnich 30 dniach — parowanie o ok. 30% wyższe", level: "duża", icon: "sun", color: "#d65f2b", layer: null },
  { name: "Woda spływa z pola", evidence: "stok do 7% na wschodzie; przy ulewach ok. 18% deszczu ucieka", level: "mała", icon: "slope", color: "#5F625B", layer: "teren" },
  { name: "Rów odprowadza wodę", evidence: "rów R-3 15 m od pola zbiera wodę z zagłębienia", level: "mała", icon: "ditch", color: "#1f6fc9", layer: "teren" },
];

// Drought per past season for the demo parcel, judged for the crop that grew that year.
const PAST: Record<number, [string, DroughtTag]> = {
  2007: ["pszenica oz.", "brak"], 2008: ["kukurydza", "umiark."], 2009: ["rzepak", "brak"],
  2010: ["pszenica oz.", "brak"], 2011: ["kukurydza", "lekka"], 2012: ["jęczmień", "umiark."],
  2013: ["kukurydza", "lekka"], 2014: ["pszenica oz.", "brak"], 2015: ["kukurydza", "skrajna"],
  2016: ["pszenica oz.", "lekka"], 2017: ["kukurydza", "brak"], 2018: ["pszenica oz.", "skrajna"],
  2019: ["kukurydza", "silna"], 2020: ["rzepak", "brak"], 2021: ["pszenica oz.", "lekka"],
  2022: ["kukurydza", "silna"], 2023: ["jęczmień", "umiark."], 2024: ["pszenica oz.", "brak"],
  2025: ["kukurydza", "umiark."], 2026: ["kukurydza", "silna"],
};

export interface ReportParams {
  parcelId?: string | null;
  date: string;
  crop?: string | null;
}

export function buildReport({ parcelId, date, crop }: ReportParams): Report | null {
  const parcel = findParcelById(parcelId || DEMO_PARCEL_ID);
  if (!parcel) return null;
  const chosen = cropById(crop);
  const cropInfo = chosen ?? cropById(parcel.detectedCrop)!;
  const season = seasonOf(date);
  const late = season === "poza-sezonem";
  const win = historyWindow(date);
  const yearsLabel = `${win.firstYear}–${win.lastYear}`;
  const nextYear = late ? win.lastYear + 1 : win.lastYear;

  const actions = BASE_ACTIONS.map((a) => ({ ...a, ...(late ? OFF_SEASON[a.id] : {}) }));

  const history: SeasonHistory[] = win.years.map(({ year }) => {
    const [c, tag] = PAST[year] ?? ["kukurydza", (["brak", "lekka", "umiark."] as DroughtTag[])[year % 3]];
    return { year, crop: c, tag };
  });
  const droughtCount = history.filter((h) => h.tag !== "brak").length;

  const mapInfo: Record<MapLayer, { say: string; src: string }> = {
    plan: {
      say: late
        ? "5 działań: teraz zatrzymaj wodę z zimy (1–3) i zostaw resztki (4); nawadnianie zaplanuj na lato (5)."
        : "5 działań: najpierw zatrzymaj wodę (1–3), potem pole (4), teraz podlej (5).",
      src: "Kliknij numer, aby zobaczyć, dlaczego właśnie tam.",
    },
    sucho: {
      say: late
        ? `Latem ${win.lastYear} wschodni pas wysechł pierwszy — tak samo w latach z suszą.`
        : "Wschodni pas wysycha pierwszy; zagłębienie w rogu trzyma wodę najdłużej.",
      src: `Wilgotność roślin (NDMI) z Sentinel-2 w szczycie sezonu ${win.lastYear}, w porównaniu z latami ${win.firstYear}–${win.lastYear - 1}`,
    },
    teren: {
      say: "Deszcz spływa z zachodu do zagłębienia w rogu (NE) i dalej rowem R-3 poza pole.",
      src: "Model terenu GUGiK 1 m (spadki, kierunki spływu, zagłębienia) · rów: BDOT10k",
    },
    gleba: {
      say: "Im dalej na wschód, tym lżejsza gleba — piasek trzyma najmniej wody.",
      src: "Kategorie podatności gleb na suszę IUNG-PIB · skład gleby SoilGrids 250 m",
    },
  };

  const cropLower = cropInfo.name.toLowerCase();
  const common = {
    parcel,
    crop: cropInfo,
    cropDetected: !chosen || chosen.id === parcel.detectedCrop,
    date,
    dateLong: longDate(date),
    season,
    yearsLabel,
    confidence: { level: "wysoka", agreeing: 4, total: 4 },
    actions,
    mapInfo,
    causes: CAUSES,
    history,
    historyNote: `Susza wg IUNG w ${droughtCount} z 10 sezonów, każdy oceniony dla uprawy, która wtedy rosła (ARiMR, mapa upraw Copernicus).`,
    sources: [
      { label: "granice — ULDK GUGiK", state: "ok" as const },
      { label: `pogoda ${yearsLabel} — ERA5-Land`, state: "ok" as const },
      { label: late ? "prognoza — klimatologia 10 lat" : "prognoza 7 dni — Open-Meteo", state: "ok" as const },
      { label: "uprawa — deklaracje ARiMR", state: "ok" as const },
      { label: `satelita — ${win.satSrc}`, state: "ok" as const },
      { label: "gleba — IUNG-PIB, SoilGrids", state: "ok" as const },
      { label: "progi suszy — IUNG", state: "ok" as const },
      { label: "teren — NMT GUGiK 1 m", state: "ok" as const },
      { label: "rowy — BDOT10k", state: "ok" as const },
      { label: "tło suszy — EDO", state: "ok" as const },
      { label: "granice, rowy, teren — stan na dziś", state: "current" as const },
      { label: "wody gruntowe — brak danych", state: "missing" as const },
    ],
    advisorDetails: [
      `Klimatyczny bilans wodny (60 dni): opad 74 mm − parowanie (ET0 FAO-56) 288 mm = −214 mm; próg suszy IUNG dla uprawy ${cropLower}, gleba kat. II: −188 mm (Rozp. MRiRW 2019)`,
      "Zapas wody w strefie korzeni 26 z 110 mm (24%), próg stresu (RAW) 45% · bilans dobowy FAO-56, Kc w kwitnieniu 1,20",
      `SPEI-3: −1,7 (klimatologia 30 lat, ERA5) · anomalia wilgotności gleby EDO: ujemna · CDI EDO: „ostrzeżenie”`,
      `NDMI −1,6 σ, VCI 18 względem tego samego okresu ${win.firstYear}–${win.lastYear - 1} (${win.satSrc})`,
      "Uprawy w latach ubiegłych: deklaracje ARiMR (GSA) i mapa upraw Copernicus; gdzie brak — przyjęto uprawę bieżącą",
      "Prognoza: bilans FAO-56 od dzisiejszego zapasu przez pogodę 10 sezonów (metoda scenariuszy ESP); 10 lat to mała próba — wyniki zaokrąglone do „x z 10”",
      "Rozdzielczość: pogoda ok. 9 km, gleba 250 m / kontury IUNG, satelita 10 m · niepewność zapasu wody ±15 mm",
      "Nie uwzględniono: wód gruntowych, drenowania, odmiany i terminu siewu, nawadniania już stosowanego",
    ],
  };

  if (late) {
    return {
      ...common,
      soilWaterPct: 61,
      stressThresholdPct: 45,
      status: { label: `Plan na ${nextYear}`, tone: "plan" },
      headline: `Sezon ${nextYear}: ryzyko suszy w lipcu 5 na 10 — z planem 2 na 10`,
      summary: `Liczymy od dzisiejszego zapasu wody (61%) przez pogodę 10 ostatnich sezonów. Bez działań ${cropLower} wejdzie w stres w czerwcu–lipcu w połowie scenariuszy. Teraz najtaniej zatrzymać wodę z zimy.`,
      urgent: { actionId: "zastawka", label: "NAJLEPIEJ TERAZ", title: "Postaw zastawkę na rowie przed zimą", sub: "zatrzyma wodę z roztopów na wiosnę" },
      mobileHeadline: "Sezon był suchy",
      mobileSub: "Teraz czas zatrzymać wodę z zimy. Zapas w glebie się odbudowuje (61%).",
      risk: {
        head: `Ryzyko w sezonie ${nextYear}`,
        say: "Bez działań: stres w lipcu w 5 z 10 scenariuszy, brak ok. 60 mm wody (w suchym roku 110 mm). Z całym planem: 2 z 10.",
        note: `Start: dzisiejszy zapas 61%, dalej pogoda z sezonów ${yearsLabel}. To „jak bywało”, nie prognoza pogody.`,
        cols: ["kwi", "maj", "cze", "lip", "sie", "wrz"],
        noAction: [0, 2, 4, 5, 3, 1],
        withPlan: [0, 1, 2, 2, 1, 0],
      },
    };
  }

  return {
    ...common,
    soilWaterPct: 24,
    stressThresholdPct: 45,
    status: { label: "Susza", tone: "danger" },
    headline: `${cropInfo.name} już cierpi — i bez wody będzie gorzej`,
    summary: "Dziś w glebie zostało 24% wody (stres poniżej 45%). W 9 z 10 scenariuszy na najbliższe 2 tygodnie zapas spadnie poniżej 15%. Spełnione kryterium suszy IUNG.",
    urgent: { actionId: "woda", label: "PILNE TERAZ", title: "Podlej 25 mm wschodnią część do piątku", sub: "prognoza na 7 dni: tylko 3 mm deszczu" },
    mobileHeadline: "Gleba prawie sucha",
    mobileSub: `W 10 sezonach tak sucho było rzadko. Próg suszy IUNG przekroczony.`,
    risk: {
      head: "Co czeka działkę w najbliższych tygodniach",
      say: `Bez podlewania ${cropLower} będzie w stresie do połowy sierpnia w 9 z 10 scenariuszy. Z dawką 25 mm teraz — w 1–3 z 10.`,
      note: `Pierwsze 7 dni z prognozy Open-Meteo, dalej pogoda z sezonów ${yearsLabel} (te same dni roku).`,
      cols: weekCols(date),
      noAction: [9, 9, 8, 7, 5, 4],
      withPlan: [1, 2, 3, 3, 2, 2],
    },
  };
}

function weekCols(iso: string): string[] {
  const base = new Date(`${iso}T12:00:00Z`);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(base.getTime() + (i + 1) * 7 * 86400000);
    return `do ${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function reportTitle(r: Report): string {
  return `Działka ${r.parcel.number} · ${r.crop.name.toLowerCase()} · ${shortDate(r.date)}`;
}

export type { CropId };
