// Example report built from the UI mockup (makieta-ui/Raport.dc.html) and the rules in pipeline_plan.md.
// All numbers are illustrative. The real pipeline replaces buildReport() and returns the same `Report` JSON.

import { historyWindow, isEarlySeason, longDate, seasonOf, shortDate } from "../dates";
import type {
  Cause, Crop, DroughtTag, MapLayer, NotChecked, Report, SeasonHistory, SourceStatus, StatusTone, Zalecenie,
} from "../types";
import { cropById, findParcelById } from "./parcels";

/** Number of weather scenarios (N = 10 or 30 – decided by hindcast, METODY.md §7). */
const N = 10;

const BASE_ACTIONS: Zalecenie[] = [
  {
    regula: "R1", n: 1, kategoria: "ret", x: 93.5, y: 11, warstwa: "teren",
    co: "Zastawka na rowie", gdzie: "rów R-3 przy północno-wschodnim rogu", kiedy: "jesienią, przed zimą",
    ile: null, bo: ["rowem ucieka woda z wiosny"], fakty: ["F8", "F7b"],
    co_zyskasz: `na wiosnę gleba startuje pełniejsza; ryzyko w czerwcu 4/${N} → 3/${N}`,
    dlaczego: "Rów (BDOT10k) biegnie 15 m od działki i odprowadza wodę z ok. 40 ha. Piętrzenie od jesieni zatrzyma wodę z roztopów, której w lipcu brakuje na lekkiej glebie.",
    tagi: ["koszt niski", "spowolnienie odpływu (NWRM)", "zgłoszenie wodnoprawne"],
  },
  {
    regula: "R2", n: 2, kategoria: "ret", x: 78.7, y: 22.5, warstwa: "teren",
    co: "Zatrzymaj wodę w zagłębieniu", gdzie: "najniższy róg pola (NE), ok. 0,15 ha", kiedy: "po zbiorze",
    ile: "ok. 300 m³", bo: ["tu spływa deszcz z 70% pola"], fakty: ["F7", "F7b", "F10"],
    co_zyskasz: "ok. 300 m³ na lipiec — jedna dawka 20 mm dla 1,5 ha",
    dlaczego: "Model terenu pokazuje zagłębienie bez odpływu — zmieści ok. 300 m³. W 9 z 10 sezonów było tu wilgotniej niż na reszcie pola.",
    tagi: ["NWRM N01", "możliwe dofinansowanie"],
  },
  {
    regula: "R3", n: 3, kategoria: "ret", x: 85.5, y: 80, warstwa: "teren",
    co: "Pas trawy lub drzew", gdzie: "wschodni skraj pola", kiedy: "od jesieni",
    ile: "pas 6–10 m", bo: ["stok do 7% — woda z ulew ucieka"], fakty: ["F7", "F7b"],
    co_zyskasz: "o ok. 30–50% mniej wody ucieka z ulew na wschodzie",
    dlaczego: "Przy ulewach ok. 18% deszczu spływa tu z pola (model terenu + metoda SCS-CN). Pas spowolni spływ, zatrzyma glebę i osłoni pole od wiatru.",
    tagi: ["NWRM A02", "ekoschematy"],
  },
  {
    regula: "R5", n: 4, kategoria: "agro", x: 33, y: 52, warstwa: "gleba",
    co: "Międzyplon i resztki po zbiorze", gdzie: "całe pole", kiedy: "wrzesień, zaraz po zbiorze",
    ile: null, bo: ["lekka gleba", "mało próchnicy"], fakty: ["F6", "F6c"],
    co_zyskasz: `średnio 6 dni stresu mniej w sezonie (w 7 z ${N} scenariuszy)`,
    dlaczego: "Gleba kat. I–II (IUNG), ok. 0,9% węgla (SoilGrids). Okrywa i resztki poprawią wsiąkanie wody i ograniczą parowanie. Na lekkiej glebie zniszcz międzyplon wcześnie wiosną — sam też zużywa wodę.",
    tagi: ["cała działka", "NWRM A08 / A13", "zniszcz wcześnie wiosną"],
  },
  {
    regula: "R7", n: 5, kategoria: "irr", x: 74.5, y: 62, warstwa: "sucho",
    co: "Podlej wschodnią część", gdzie: "wschodnia część, ok. 1,6 ha", kiedy: "w ciągu 3 dni, rano lub wieczorem",
    ile: "25 mm netto · ok. 450 m³", bo: ["najsuchsza część pola", "uprawa w fazie wrażliwej"], fakty: ["F4", "F4p", "F11", "F10"],
    co_zyskasz: `stres w najbliższych tygodniach: 9/${N} → 2/${N} scenariuszy`,
    dlaczego: "Zapas wody w glebie (24%) jest poniżej progu stresu, a prognoza na 7 dni daje tylko 3 mm. W fazie wrażliwej brak wody najbardziej obniża plon.",
    tagi: ["bilans FAO-56 + prognoza"],
  },
];

const OFF_SEASON: Partial<Record<number, Partial<Zalecenie>>> = {
  1: {
    kiedy: "teraz, przed zimą (do połowy grudnia)", bo: ["rowem ucieka woda z roztopów"],
    ile: "szac. 2–4 tys. m³ wody w rowie",
    co_zyskasz: `ryzyko w czerwcu: 4/${N} → 3/${N}`,
    dlaczego: "Rów (BDOT10k) biegnie 15 m od działki i odprowadza wodę z ok. 40 ha. Zastawka postawiona teraz zatrzyma wodę z zimy i roztopów — tej wody zabrakło w czerwcu i lipcu.",
  },
  2: {
    kiedy: "teraz lub wczesną wiosną",
    dlaczego: "Model terenu pokazuje zagłębienie bez odpływu — zmieści ok. 300 m³. Woda z roztopów może tu stać do maja i zasilać glebę wokół.",
  },
  3: { kiedy: "sadzenie: listopad lub marzec" },
  4: {
    co: "Zostaw resztki, nie orz na zimę", kiedy: "teraz — pole po zbiorze",
    co_zyskasz: "mniej parowania wiosną: średnio 4 dni stresu mniej w kolejnym sezonie",
    dlaczego: "Gleba kat. I–II (IUNG), ok. 0,9% węgla (SoilGrids). Rozdrobnione resztki na powierzchni zatrzymają śnieg i ograniczą parowanie wiosną. W przyszłym sezonie po zbiorze: międzyplon, zniszczony wcześnie wiosną.",
    tagi: ["cała działka", "NWRM A13 / A08", "koszt: brak"],
  },
  5: {
    regula: "R8", co: "Przygotuj nawadnianie na lato", kiedy: "plan teraz, podlewanie czerwiec–lipiec",
    ile: "60–110 mm na sezon · ok. 1000–1800 m³", bo: [`w 5 z ${N} scenariuszy zabraknie wody w lipcu`], fakty: ["F18", "F19", "F10"],
    co_zyskasz: `ryzyko strat w lipcu 5/${N} → 1/${N}; zagłębienie (2) pokryje ok. 1/3 potrzeb`,
    dlaczego: `Scenariusze z ${N} sezonów: w typowym roku uprawa na wschodzie będzie potrzebować ok. 60 mm dodatkowej wody, w suchym ok. 110 mm. Teraz nie podlewaj — gleba odbudowuje zapas.`,
    tagi: ["sprawdź źródło wody i pozwolenie"],
  },
};

const CAUSES: Cause[] = [
  { id: "C1", name: "Mało deszczu", evidence: "od maja 74 mm zamiast ok. 140 mm normy · SPEI −1,7", level: "główna", icon: "rain", color: "#2a78d6", layer: null },
  { id: "C3", name: "Lekka, piaszczysta gleba", evidence: "kat. I–II IUNG — mały „zbiornik” na wodę, zwłaszcza na wschodzie", level: "duża", icon: "sand", color: "#C9A46B", layer: "gleba" },
  { id: "C2", name: "Upał", evidence: "9 dni ponad 30°C w ostatnich 30 dniach — parowanie o ok. 30% wyższe", level: "duża", icon: "sun", color: "#d65f2b", layer: null },
  { id: "C4", name: "Woda spływa z pola", evidence: "stok do 7% na wschodzie; przy ulewach ok. 18% deszczu ucieka", level: "mała", icon: "slope", color: "#5F625B", layer: "teren" },
  { id: "C5", name: "Rów odprowadza wodę", evidence: "rów R-3 15 m od pola zbiera wodę z zagłębienia", level: "mała", icon: "ditch", color: "#1f6fc9", layer: "teren" },
];

const CROP_NAME: Record<string, string> = {
  kukurydza: "kukurydza", pszenica: "pszenica oz.", jare: "jęczmień", rzepak: "rzepak", laka: "łąka",
};

// Drought per past season (IUNG), judged for the crop that grew that year.
const PAST_TAG: Record<number, DroughtTag> = {
  2007: "brak", 2008: "umiark.", 2009: "brak", 2010: "brak", 2011: "lekka", 2012: "umiark.", 2013: "lekka",
  2014: "brak", 2015: "skrajna", 2016: "lekka", 2017: "brak", 2018: "skrajna", 2019: "silna", 2020: "brak",
  2021: "lekka", 2022: "silna", 2023: "umiark.", 2024: "brak", 2025: "umiark.", 2026: "silna",
};

/** pipeline_plan.md etap 5: share of scenarios below the stress threshold in the next 14 days. */
function seasonTone(share: number): StatusTone {
  return share >= 0.7 ? "susza" : share >= 0.3 ? "zagrozenie" : "spokojnie";
}

export interface ReportParams {
  parcelId?: string | null;
  date: string;
  crop?: string | null;
  today: string;
}

export type BuildResult = { report: Report } | { error: "not-found" } | { error: "crop-required" };

export function buildReport({ parcelId, date, crop, today }: ReportParams): BuildResult {
  const found = parcelId ? findParcelById(parcelId, date) : null;
  if (!found) return { error: "not-found" };
  const { parcel, cropHint, outOfScope } = found;
  const win = historyWindow(date);
  const yearsLabel = `${win.firstYear}–${win.lastYear}`;
  const isToday = date === today;
  const fetchedAt = today;

  const src = (id: string, label: string, state: SourceStatus["state"] = "ok"): SourceStatus => ({
    id, label, state, fetchedAt: state === "missing" ? null : fetchedAt,
  });

  const common = {
    parcel,
    date,
    dateLong: longDate(date),
    isToday,
    season: seasonOf(date),
    yearsLabel,
    scenarios: N,
  };

  if (outOfScope) {
    return {
      report: {
        ...common,
        crop: null,
        cropSource: "",
        soilWaterPct: null,
        stressThresholdPct: null,
        status: { label: "Poza zakresem", tone: "poza-zakresem" },
        headline: "To nie jest grunt rolny — ocena rolnicza niedostępna",
        summary: `Według mapy IUNG-PIB działka to ${parcel.landUse}. Bilans wody, progi suszy i zalecenia dotyczą tylko upraw rolnych i użytków zielonych.`,
        confidence: { level: "wysoka", agreeing: 1, total: 1, note: null },
        urgent: null,
        actions: [],
        mapInfo: emptyMapInfo(),
        causes: [],
        risk: null,
        justification: null,
        sources: [src("P0", "granice — ULDK GUGiK"), src("P4", "pokrycie terenu — IUNG-PIB")],
        notChecked: [{ what: "Bilans wody i zalecenia", why: "działka nierolnicza (kod IUNG: las, woda, zabudowa lub drogi)" }],
        advisorDetails: [],
      },
    };
  }

  const chosen: Crop | undefined = cropById(crop) ?? (cropHint ? cropById(cropHint.crop) : undefined);
  if (!chosen) return { error: "crop-required" };
  const cropSource = crop && crop !== cropHint?.crop ? "wybrana przez Ciebie" : `podpowiedź: ${cropHint?.source}`;
  const cropLower = chosen.name.toLowerCase();
  const late = common.season === "poza-sezonem";
  const early = isEarlySeason(date);
  const nextYear = win.lastYear + 1;

  const actions = BASE_ACTIONS.map((a) => {
    const x = { ...a, ...(late ? OFF_SEASON[a.n] : {}) };
    if (x.regula === "R7" && !isToday) {
      x.bo = [...x.bo, "bez prognozy z tamtego dnia — przyjęto średnią z 10 lat"];
    }
    return x;
  });

  const history: SeasonHistory[] = win.years.map(({ year }) => {
    const declared = findParcelById(parcel.id, `${year}-07-01`)?.cropHint?.crop;
    return {
      year,
      crop: declared ? CROP_NAME[declared] ?? declared : `${cropLower}*`,
      tag: PAST_TAG[year] ?? "brak",
    };
  });
  const droughtCount = history.filter((h) => h.tag !== "brak").length;
  const hasGuessed = history.some((h) => h.crop.endsWith("*"));

  const iungNow = !chosen.hasOfficialThreshold
    ? `Brak urzędowego progu suszy IUNG dla uprawy „${cropLower}” — ocena tylko z bilansu wody w glebie (FAO-56).`
    : late
      ? `Kryterium suszy IUNG dotyczy sezonu 21.III–30.IX. W minionym sezonie (${win.lastYear}) było spełnione w czerwcu i lipcu.`
      : early
        ? `Kryterium suszy IUNG liczone z niepełnego okresu 60 dni (przed 20.V): bilans −96 mm przy progu −129 mm — jeszcze nie spełnione.`
        : `Kryterium suszy IUNG spełnione: bilans 60 dni −214 mm, próg −188 mm (${cropLower}, gleba kat. II).`;

  const notChecked: NotChecked[] = [
    { what: "Wody gruntowe", why: "brak publicznych danych o poziomie wód gruntowych dla działki" },
    { what: "Drenowanie", why: "brak danych o sieci drenarskiej" },
    { what: "Dokładny model terenu 1 m", why: "liczy się w tle (NMT GUGiK odpowiada 1–2 min); użyto Copernicus DEM 30 m" },
  ];
  if (!chosen.hasOfficialThreshold) notChecked.unshift({ what: "Urzędowe kryterium suszy IUNG", why: `brak progu dla uprawy „${cropLower}” w tabeli IUNG` });

  const sources: SourceStatus[] = [
    src("P0", "granice — ULDK GUGiK"),
    src("P1", `pogoda ${win.firstYear - 20}–${win.lastYear} — ERA5-Land (Open-Meteo)`),
    isToday ? src("P3", "prognoza 7 dni — Open-Meteo") : src("P3", "prognoza — średnia z 10 lat (data archiwalna)", "current"),
    src("P11", cropSource.startsWith("podpowiedź") ? `uprawa — ${cropHint?.source}` : "uprawa — wybrana przez Ciebie"),
    src("P10", `satelita — ${win.satSrc} (Planetary Computer)`),
    src("P4", "gleba — IUNG-PIB, SoilGrids"),
    src("P6", chosen.hasOfficialThreshold ? "progi suszy — IUNG" : "progi suszy — brak dla tej uprawy", chosen.hasOfficialThreshold ? "ok" : "missing"),
    src("P7", "teren — Copernicus DEM 30 m"),
    src("P8", "rowy — BDOT10k"),
    src("P12", "tło suszy — EDO"),
    src("P7", "granice, rowy, teren — stan na dziś", "current"),
    src("—", "wody gruntowe — brak danych", "missing"),
  ];

  const confidence = early
    ? { level: "średnia" as const, agreeing: 3, total: 4, note: "brak pełnego okresu 60 dni — bilans z niepełnego okresu" }
    : !chosen.hasOfficialThreshold
      ? { level: "średnia" as const, agreeing: 3, total: 4, note: "bez urzędowego progu IUNG" }
      : { level: "wysoka" as const, agreeing: 4, total: 4, note: null };

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
      src: "Copernicus DEM 30 m (spadki, kierunki spływu, zagłębienia); dokładny NMT GUGiK 1 m w tle · rów: BDOT10k",
    },
    gleba: {
      say: "Im dalej na wschód, tym lżejsza gleba — piasek trzyma najmniej wody.",
      src: "Kategorie podatności gleb na suszę IUNG-PIB · skład gleby SoilGrids 250 m",
    },
  };

  const advisorDetails = [
    `Klimatyczny bilans wodny (60 dni): opad 74 mm − parowanie (ET0 FAO-56) 288 mm = −214 mm`,
    "Zapas wody w strefie korzeni 26 z 110 mm (24%), próg stresu (RAW) 45% · bilans dobowy FAO-56",
    "SPEI-3: −1,7 (klimatologia 30 lat, ERA5-Land) · CDI EDO: „ostrzeżenie”",
    `NDMI −1,6 σ, VCI 18 względem tego samego okresu ${win.firstYear}–${win.lastYear - 1} (${win.satSrc})`,
    `Scenariusze: bilans FAO-56 od dzisiejszego zapasu przez pogodę ${N} poprzednich sezonów (metoda ESP); wyniki jako „x z ${N}”`,
    "Rozdzielczość: pogoda ok. 9 km, gleba 250 m / kontury IUNG, satelita 10–30 m, teren 30 m · niepewność zapasu wody ±15 mm",
  ];

  const justification = {
    iungNow,
    history,
    historyNote:
      `Susza wg IUNG w ${droughtCount} z 10 sezonów, każdy oceniony dla uprawy, która wtedy rosła (ARiMR, mapa upraw JRC).` +
      (hasGuessed ? " * — lata bez danych o uprawie: przyjęto bieżącą uprawę." : ""),
  };

  if (late) {
    const noAction = [0, 2, 4, 5, 3, 1];
    const withPlan = [0, 1, 2, 2, 1, 0];
    return {
      report: {
        ...common,
        crop: chosen, cropSource, actions, mapInfo, causes: CAUSES, sources, notChecked, advisorDetails, justification, confidence,
        soilWaterPct: 61,
        stressThresholdPct: 45,
        status: { label: `Plan na sezon ${nextYear}`, tone: "plan" },
        headline: `Sezon ${nextYear}: ryzyko suszy w lipcu ${Math.max(...noAction)} na ${N} — z planem ${Math.max(...withPlan)} na ${N}`,
        summary: `W ${Math.max(...noAction)}/${N} scenariuszy ${cropLower} wejdzie w stres w czerwcu–lipcu. Z planem: ${Math.max(...withPlan)}/${N}. Dziś zapas wody w glebie się odbudowuje (61%) — teraz najtaniej zatrzymać wodę z zimy.`,
        urgent: { n: 1, label: "NAJLEPIEJ TERAZ", title: "Postaw zastawkę na rowie przed zimą", sub: "zatrzyma wodę z roztopów na wiosnę" },
        risk: {
          head: `Ryzyko w sezonie ${nextYear}`,
          say: `Bez działań: stres w lipcu w ${Math.max(...noAction)} z ${N} scenariuszy, brak ok. 60 mm wody (w suchym roku 110 mm). Z całym planem: ${Math.max(...withPlan)} z ${N}.`,
          note: `Start: dzisiejszy zapas 61%, dalej pogoda z ${N} poprzednich sezonów. To „jak bywało”, nie prognoza pogody.`,
          cols: ["kwi", "maj", "cze", "lip", "sie", "wrz"],
          noAction,
          withPlan,
        },
      },
    };
  }

  const noAction = [9, 9, 8, 7, 5, 4];
  const withPlan = [1, 2, 3, 3, 2, 2];
  const tone = seasonTone(noAction[0] / N);
  const soil = 24;
  const threshold = 45;
  const label = tone === "susza" ? (soil < threshold ? "Susza trwa" : "Susza nadchodzi") : tone === "zagrozenie" ? "Zagrożenie" : "Spokojnie";
  return {
    report: {
      ...common,
      crop: chosen, cropSource, actions, mapInfo, causes: CAUSES, sources, notChecked, advisorDetails, justification, confidence,
      soilWaterPct: soil,
      stressThresholdPct: threshold,
      status: { label, tone },
      headline: `${chosen.name} już cierpi — i bez wody będzie gorzej`,
      summary: `Dziś w glebie zostało ${soil}% wody, poniżej progu stresu (${threshold}%). W ${noAction[0]}/${N} scenariuszy zapas nie wróci powyżej progu w ciągu 2 tygodni.`,
      urgent: {
        n: 5,
        label: "PILNE TERAZ",
        title: "Podlej 25 mm wschodnią część w ciągu 3 dni",
        sub: isToday ? "prognoza na 7 dni: tylko 3 mm deszczu" : "bez prognozy z tamtego dnia — średnio 3 mm w kolejnych 7 dniach",
      },
      risk: {
        head: "Co czeka działkę w najbliższych tygodniach",
        say: `Bez podlewania ${cropLower} będzie w stresie do połowy sierpnia w ${noAction[3]} z ${N} scenariuszy. Z dawką 25 mm teraz — w 1–3 z ${N}.`,
        note: isToday
          ? `Pierwsze 7 dni z prognozy Open-Meteo, dalej pogoda z ${N} poprzednich sezonów (te same dni roku).`
          : `Data archiwalna: zamiast prognozy średnia z 10 lat, dalej pogoda z ${N} poprzednich sezonów.`,
        cols: weekCols(date),
        noAction,
        withPlan,
      },
    },
  };
}

function emptyMapInfo(): Record<MapLayer, { say: string; src: string }> {
  const x = { say: "", src: "" };
  return { plan: x, sucho: x, teren: x, gleba: x };
}

function weekCols(iso: string): string[] {
  const base = new Date(`${iso}T12:00:00Z`);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(base.getTime() + (i + 1) * 7 * 86400000);
    return `do ${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function reportTitle(r: Report): string {
  return `Działka ${r.parcel.number}${r.crop ? ` · ${r.crop.name.toLowerCase()}` : ""} · ${shortDate(r.date)}`;
}

export function reportUrl(p: { dzialka: string; data: string; uprawa?: string | null }): string {
  const q = new URLSearchParams({ dzialka: p.dzialka, data: p.data });
  if (p.uprawa) q.set("uprawa", p.uprawa);
  return `/raport?${q}`;
}
