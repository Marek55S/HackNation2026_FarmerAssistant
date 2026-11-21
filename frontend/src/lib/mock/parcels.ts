import type { Crop, CropId, Parcel } from "../types";

export const CROPS: Crop[] = [
  { id: "kukurydza", name: "Kukurydza", hint: "na ziarno lub kiszonkę" },
  { id: "pszenica", name: "Zboża ozime", hint: "pszenica, żyto, pszenżyto" },
  { id: "jare", name: "Zboża jare", hint: "jęczmień, owies" },
  { id: "rzepak", name: "Rzepak", hint: "" },
  { id: "ziemniak", name: "Ziemniak", hint: "" },
  { id: "burak", name: "Burak cukrowy", hint: "" },
  { id: "laka", name: "Łąka / pastwisko", hint: "trwałe użytki zielone" },
  { id: "inna", name: "Inna uprawa", hint: "warzywa, sady, strączkowe" },
];

export function cropById(id: string | null | undefined): Crop | undefined {
  return CROPS.find((c) => c.id === id);
}

/** EGiB parcel id: TERYT unit (6 digits + _ + digit) . precinct (4 digits) . number (with optional /sub) */
export const PARCEL_ID_RE = /^\d{6}_\d\.\d{4}\.\d+(\/\d+)?$/;

export const DEMO_PARCEL_ID = "040410_2.0012.245/3";

const DEMO: Parcel = {
  id: DEMO_PARCEL_ID,
  number: "245/3",
  gmina: "Szubin",
  obreb: "Godzimierz",
  wojewodztwo: "kujawsko-pomorskie",
  areaHa: 4.82,
  landUse: "grunty orne",
  detectedCrop: "kukurydza",
  cropSource: "deklaracja ARiMR 2025 + zdjęcie satelitarne z 11.07.2026 (wzrost typowy dla kukurydzy)",
};

const OTHERS: Parcel[] = [
  { ...DEMO, id: "040410_2.0012.118", number: "118", areaHa: 6.1, detectedCrop: "pszenica", cropSource: "deklaracja ARiMR 2025" },
  { ...DEMO, id: "040410_2.0012.119/2", number: "119/2", areaHa: 2.3, landUse: "łąki trwałe", detectedCrop: "laka", cropSource: "deklaracja ARiMR 2025" },
];

/**
 * Mock of ULDK GetParcelById. Known demo ids return fixed data; any other well-formed id returns
 * a plausible parcel so the whole flow can be clicked through.
 */
export function findParcelById(id: string): Parcel | null {
  const clean = id.trim();
  const known = [DEMO, ...OTHERS].find((p) => p.id === clean);
  if (known) return known;
  if (!PARCEL_ID_RE.test(clean)) return null;
  const number = clean.split(".").pop() ?? clean;
  const seed = [...clean].reduce((a, c) => a + c.charCodeAt(0), 0);
  const crops: CropId[] = ["kukurydza", "pszenica", "rzepak", "jare", "burak"];
  return {
    ...DEMO,
    id: clean,
    number,
    gmina: "—",
    obreb: clean.split(".")[1] ?? "—",
    areaHa: Math.round((1 + (seed % 90) / 10) * 100) / 100,
    detectedCrop: crops[seed % crops.length],
    cropSource: "deklaracja ARiMR 2025 (dane przykładowe)",
  };
}

/** Mock of ULDK GetParcelByIdOrNr (gmina + obręb + numer). */
export function findParcelByName(gmina: string, obreb: string, number: string): Parcel | null {
  const g = gmina.trim().toLowerCase();
  const o = obreb.trim().toLowerCase();
  const n = number.trim();
  if (!g || !o || !n) return null;
  const known = [DEMO, ...OTHERS].find(
    (p) => p.gmina.toLowerCase() === g && p.obreb.toLowerCase() === o && p.number === n,
  );
  if (known) return known;
  return { ...DEMO, id: `000000_0.0000.${n}`, number: n, gmina, obreb, cropSource: "deklaracja ARiMR 2025 (dane przykładowe)" };
}

/** Mock of ULDK GetParcelByXY — the demo map only has the demo parcel and its neighbours. */
export function findParcelByPoint(x: number): Parcel {
  if (x < 0.33) return OTHERS[0];
  if (x > 0.8) return OTHERS[1];
  return DEMO;
}
