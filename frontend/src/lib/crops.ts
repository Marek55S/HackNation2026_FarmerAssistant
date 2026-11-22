// Crops the farmer can pick (rows of dane/kbw_progi_iung.csv + grassland / other) and ARiMR crop-name mapping.

import type { Crop, CropId } from "./types";

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
  { id: "brak", name: "Brak uprawy", hint: "tylko retencja i teren — bez zaleceń polowych", hasOfficialThreshold: false },
];

export function cropById(id: string | null | undefined): Crop | undefined {
  return CROPS.find((c) => c.id === id);
}

/** ARiMR crop name → app crop (same rules as the backend's crops.z_arimr). */
export function cropFromArimr(roslina: string): CropId | null {
  const r = roslina.toLowerCase();
  if (!r) return null;
  if (r.includes("kukurydz")) return "kukurydza";
  if (r.includes("rzepak") || r.includes("rzepik")) return "rzepak";
  if (r.includes("ziemniak")) return "ziemniak";
  if (r.includes("burak")) return "burak";
  if (["łąk", "pastw", "trwał", "traw", "lucern", "koniczyn"].some((k) => r.includes(k)) || /(^|[^a-ząćęłńóśźż])tuz([^a-ząćęłńóśźż]|$)/.test(r))
    return "laka";
  if (["pszen", "żyto", "jęczm", "owies", "pszenżyt", "mieszank"].some((k) => r.includes(k))) {
    return r.includes("ozim") || (!r.includes("owies") && !r.includes("jar")) ? "pszenica" : "jare";
  }
  return "inna";
}
