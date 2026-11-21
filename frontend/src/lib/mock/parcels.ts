// Example parcels (mock of ULDK + ARiMR GSA + IUNG land cover). All values are illustrative.

import { parseIso } from "../dates";
import type { Crop, CropHint, CropId, Parcel, ParcelLookup } from "../types";

export const CROPS: Crop[] = [
  { id: "kukurydza", name: "Kukurydza", hint: "na ziarno lub kiszonkę", hasOfficialThreshold: true },
  { id: "pszenica", name: "Zboża ozime", hint: "pszenica, żyto, pszenżyto", hasOfficialThreshold: true },
  { id: "jare", name: "Zboża jare", hint: "jęczmień, owies", hasOfficialThreshold: true },
  { id: "rzepak", name: "Rzepak", hint: "", hasOfficialThreshold: true },
  { id: "ziemniak", name: "Ziemniak", hint: "", hasOfficialThreshold: true },
  { id: "burak", name: "Burak cukrowy", hint: "", hasOfficialThreshold: true },
  // No row for grassland / "other" in dane/kbw_progi_iung.csv
  { id: "laka", name: "Łąka / pastwisko", hint: "trwałe użytki zielone", hasOfficialThreshold: false },
  { id: "inna", name: "Inna uprawa", hint: "warzywa, sady, strączkowe", hasOfficialThreshold: false },
];

export function cropById(id: string | null | undefined): Crop | undefined {
  return CROPS.find((c) => c.id === id);
}

/** EGiB parcel id: TERYT unit (6 digits + _ + digit) . precinct (4 digits) . number (with optional /sub) */
export const PARCEL_ID_RE = /^\d{6}_\d\.\d{4}\.\d+(\/\d+)?$/;

export const DEMO_PARCEL_ID = "040410_2.0012.245/3";

interface DemoParcel extends Parcel {
  /** Crop declared/mapped per year (ARiMR GSA 2020–2026, JRC 2018, 2022) */
  crops: Record<number, CropId>;
}

const base = { gmina: "Szubin", obreb: "Godzimierz", wojewodztwo: "kujawsko-pomorskie" };

const DEMO: DemoParcel[] = [
  {
    ...base, id: DEMO_PARCEL_ID, number: "245/3", areaHa: 4.82, landUse: "grunty orne", landCover: "rolny",
    crops: { 2018: "pszenica", 2020: "rzepak", 2021: "pszenica", 2022: "kukurydza", 2023: "jare", 2024: "pszenica", 2025: "kukurydza", 2026: "kukurydza" },
  },
  {
    ...base, id: "040410_2.0012.118", number: "118", areaHa: 6.1, landUse: "grunty orne", landCover: "rolny",
    crops: { 2018: "kukurydza", 2020: "pszenica", 2021: "rzepak", 2022: "pszenica", 2023: "kukurydza", 2024: "jare", 2025: "pszenica", 2026: "pszenica" },
  },
  {
    ...base, id: "040410_2.0012.119/2", number: "119/2", areaHa: 2.3, landUse: "łąki trwałe", landCover: "organiczna",
    crops: { 2018: "laka", 2020: "laka", 2021: "laka", 2022: "laka", 2023: "laka", 2024: "laka", 2025: "laka", 2026: "laka" },
  },
  // Non-agricultural parcel to show "Poza zakresem" (IUNG code 11 = forest)
  { ...base, id: "040410_2.0012.301", number: "301", areaHa: 3.4, landUse: "lasy", landCover: "las", crops: {} },
];

/** ARiMR GSA covers 2020–2026, JRC EU Crop Map 2018 and 2022; 2016, 2017 and 2019 have no crop data (pipeline_plan.md F0). */
function cropHintFor(p: DemoParcel, date: string): CropHint | null {
  const { y } = parseIso(date);
  const crop = p.crops[y];
  if (!crop) return null;
  return { crop, source: y === 2018 ? "mapa upraw JRC 2018" : `deklaracja ARiMR ${y}` };
}

function lookup(p: DemoParcel, date: string): ParcelLookup {
  const { crops: _crops, ...parcel } = p;
  void _crops;
  const outOfScope = ["las", "woda", "zabudowa", "drogi"].includes(p.landCover);
  return { parcel, cropHint: outOfScope ? null : cropHintFor(p, date), outOfScope };
}

export function demoParcels(): DemoParcel[] {
  return DEMO;
}

/**
 * Mock of ULDK GetParcelById. Only the demo parcels are known — we don't invent data for other ids,
 * the UI says the parcel was not found (T2.5).
 */
export function findParcelById(id: string, date: string): ParcelLookup | null {
  const p = DEMO.find((x) => x.id === id.trim());
  return p ? lookup(p, date) : null;
}

/** Mock of ULDK GetParcelByIdOrNr (gmina + obręb + numer). */
export function findParcelByName(gmina: string, obreb: string, number: string, date: string): ParcelLookup | null {
  const g = gmina.trim().toLowerCase();
  const o = obreb.trim().toLowerCase();
  const n = number.trim();
  const p = DEMO.find((x) => x.gmina.toLowerCase() === g && x.obreb.toLowerCase() === o && x.number === n);
  return p ? lookup(p, date) : null;
}

/** Mock of ULDK GetParcelByXY on the demo map. */
export function findParcelByNumber(number: string, date: string): ParcelLookup | null {
  const p = DEMO.find((x) => x.number === number);
  return p ? lookup(p, date) : null;
}
