import { NextRequest, NextResponse } from "next/server";

// Granica działki ewidencyjnej pod punktem – tylko geometria, do podświetlenia przy ruchu kursora po mapie.
// Pytamy ULDK (GUGiK) wprost, z pominięciem backendu: ten dla karty działki dociąga jeszcze ARiMR, Copernicus
// i IUNG, co trwa sekundy, a tu liczy się jedno: odpowiedź poniżej pół sekundy (zmierzone 0,35–0,7 s).
// GET /api/dzialka-hover?lon=17.753&lat=53.052

const ULDK = "https://uldk.gugik.gov.pl/";
const CACHE = new Map<string, { id: string; ring: [number, number][] } | null>();
const CACHE_MAX = 5000; // mapa wczytuje widok siatką punktów – do ~150 wpisów na widok

/** "SRID=4326;POLYGON((lon lat, …))" → największy pierścień. MULTIPOLYGON: bierzemy największy wielokąt. */
function parseWkt(wkt: string): [number, number][] | null {
  const rings = [...wkt.matchAll(/\(\(([^()]+)\)/g)].map((m) =>
    m[1]
      .split(",")
      .map((p) => p.trim().split(/\s+/).slice(0, 2).map(Number) as [number, number])
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])),
  );
  const best = rings.sort((a, b) => b.length - a.length)[0];
  return best && best.length >= 4 ? best : null;
}

export async function GET(req: NextRequest) {
  const lon = Number(req.nextUrl.searchParams.get("lon"));
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 14 || lon > 24.2 || lat < 49 || lat > 55) {
    return NextResponse.json({ error: "Punkt poza Polską." }, { status: 400 });
  }
  // Działki są duże w stosunku do dokładności kursora – siatka ~11 m wystarcza i oszczędza zapytania.
  const key = `${lon.toFixed(4)},${lat.toFixed(4)}`;
  if (CACHE.has(key)) {
    const hit = CACHE.get(key)!;
    return NextResponse.json(hit ?? { error: "Brak działki w tym miejscu." }, { status: hit ? 200 : 404 });
  }

  const url = `${ULDK}?request=GetParcelByXY&xy=${lon},${lat},4326&result=id,geom_wkt&srid=4326`;
  let text: string;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    text = await r.text();
  } catch {
    return NextResponse.json({ error: "ULDK nie odpowiada." }, { status: 502 });
  }

  const lines = text.split("\n");
  const [id, wkt] = (lines[1] ?? "").split("|");
  const ring = wkt ? parseWkt(wkt) : null;
  const out = lines[0]?.trim() === "0" && id && ring ? { id: id.trim(), ring } : null;
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, out);
  return out
    ? NextResponse.json(out, { headers: { "Cache-Control": "public, max-age=86400" } })
    : NextResponse.json({ error: "Brak działki w tym miejscu." }, { status: 404 });
}
