// Real ULDK GetParcelByXY (server side): the cadastral parcel under a point clicked on a crop field.
// Used by /api/parcel?mapa=xy:<lon>,<lat>[&roslina=…] so a real field is picked exactly like a demo parcel.

import type { CropHint, CropId, LngLat, ParcelLookup } from "../types";

const ULDK = "https://uldk.gugik.gov.pl/";

/** ARiMR crop name → app crop (same rules as the backend's crops.z_arimr). */
export function cropFromArimr(roslina: string): CropId | null {
  const r = roslina.toLowerCase();
  if (!r) return null;
  if (r.includes("kukurydz")) return "kukurydza";
  if (r.includes("rzepak") || r.includes("rzepik")) return "rzepak";
  if (r.includes("ziemniak")) return "ziemniak";
  if (r.includes("burak")) return "burak";
  if (["łąk", "pastw", "trwał", "traw", "lucern", "koniczyn"].some((k) => r.includes(k)) || /(^|[^a-ząćęłńóśźż])tuz([^a-ząćęłńóśźż]|$)/.test(r)) return "laka";
  if (["pszen", "żyto", "jęczm", "owies", "pszenżyt", "mieszank"].some((k) => r.includes(k))) {
    return r.includes("ozim") || (!r.includes("owies") && !r.includes("jar")) ? "pszenica" : "jare";
  }
  return "inna";
}

function ringFromWkt(wkt: string): LngLat[] {
  const body = wkt.split(";").pop() ?? "";
  const m = body.match(/\(\(([^()]+)\)/);
  if (!m) return [];
  return m[1].split(",").map((p) => {
    const [x, y] = p.trim().split(/\s+/).map(Number);
    return [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6] as LngLat;
  });
}

function areaHa(ring: LngLat[]): number {
  if (ring.length < 3) return 0;
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
  const kx = 111320 * Math.cos(lat0);
  const ky = 110574;
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
  }
  return Math.round((Math.abs(a) / 2 / 10000) * 100) / 100;
}

/** null = no parcel at that point; throws on network error. */
export async function parcelAtPoint(lon: number, lat: number, roslina: string, rok: number): Promise<ParcelLookup | null> {
  const url = new URL(ULDK);
  url.search = new URLSearchParams({
    request: "GetParcelByXY",
    xy: `${lon},${lat},4326`,
    result: "geom_wkt,id,voivodeship,commune,region,parcel",
    srid: "4326",
  }).toString();
  const r = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  const text = await r.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines[0].startsWith("-1") || lines.length < 2) return null;
  const [wkt, id, woj, gmina, obreb, numer] = lines[1].split("|");
  const geometry = ringFromWkt(wkt);
  if (!id || geometry.length < 3) return null;
  const crop = cropFromArimr(roslina);
  const cropHint: CropHint | null = crop ? { crop, source: `deklaracja ARiMR ${rok}: ${roslina}` } : null;
  return {
    parcel: {
      id,
      number: numer,
      gmina,
      obreb,
      wojewodztwo: woj,
      areaHa: areaHa(geometry),
      landUse: roslina ? `pole uprawne (ARiMR: ${roslina})` : "grunt rolny",
      landCover: "rolny",
      geometry,
    },
    cropHint,
    outOfScope: false,
  };
}
