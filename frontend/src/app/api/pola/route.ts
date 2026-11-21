import { NextRequest, NextResponse } from "next/server";

// Pola uprawne w widoku mapy: deklaracje upraw ARiMR (GSA) z WFS, filtrowane prostokątem widoku.
// Pośrednik po stronie serwera, bo serwer ARiMR zrywa połączenie, gdy zapytanie ma nagłówek Origin (każde z przeglądarki).
// GET /api/pola?bbox=minLon,minLat,maxLon,maxLat&rok=2026

const WFS = (rok: number) => `https://geoportal-w2.arimr.gov.pl/geoserver/gsa_public/uprawy_${rok}/wfs`;
const LATA = [2025, 2026]; // lata z usługą WFS (wcześniejsze tylko jako pliki do pobrania)
const MAX_DEG2 = 0.0045; // ~30 km² w Polsce (mapa przy zoomie ~13,5) – zmierzone: ARiMR ok. 0,4 s
const LIMIT = 1500;

type Geom = { type: string; coordinates: number[][][] | number[][][][] };
type Feature = { id?: string; geometry?: Geom; properties?: Record<string, unknown> };
type Out = { type: "FeatureCollection"; features: unknown[]; rok: number; obcieto: boolean };

// Pamięć podręczna w procesie serwera (dane deklaracji zmieniają się rzadko).
const CACHE = new Map<string, Out>();
const CACHE_MAX = 300;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const b = (q.get("bbox") ?? "").split(",").map(Number);
  if (b.length !== 4 || b.some((v) => !Number.isFinite(v)) || b[0] >= b[2] || b[1] >= b[3]) {
    return NextResponse.json({ error: "bbox = minLon,minLat,maxLon,maxLat" }, { status: 400 });
  }
  const [x0, y0, x1, y1] = b;
  const chciany = Number(q.get("rok"));
  const rok = LATA.includes(chciany) ? chciany : LATA[LATA.length - 1];
  if (x0 < 13.5 || x1 > 24.5 || y0 < 48.8 || y1 > 55.2) {
    return NextResponse.json({ type: "FeatureCollection", features: [], rok, obcieto: false });
  }
  if ((x1 - x0) * (y1 - y0) > MAX_DEG2) {
    return NextResponse.json({ error: "Widok za duży — przybliż mapę." }, { status: 413 });
  }
  const key = `${rok}|${b.join(",")}`;
  const hit = CACHE.get(key);
  if (hit) return NextResponse.json(hit, { headers: { "Cache-Control": "public, max-age=3600" } });

  const url = new URL(WFS(rok));
  url.search = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAMES: `gsa_public:uprawy_rolne_${rok}`,
    OUTPUTFORMAT: "application/json",
    COUNT: String(LIMIT),
    BBOX: `${y0},${x0},${y1},${x1},urn:ogc:def:crs:EPSG::4326`,
    SRSNAME: "urn:ogc:def:crs:EPSG::4326",
  }).toString();

  let data: { features?: Feature[] };
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    data = await r.json();
  } catch (e) {
    return NextResponse.json({ error: `ARiMR nie odpowiada (${(e as Error).message})` }, { status: 502 });
  }

  // ~1 m dokładności wystarczy do podświetlenia pól; mniej danych = szybciej.
  const round = (c: number[]) => [Math.round(c[0] * 1e5) / 1e5, Math.round(c[1] * 1e5) / 1e5];
  const features = (data.features ?? [])
    .filter((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"))
    .map((f, i) => {
      const g = f.geometry!;
      const coordinates =
        g.type === "Polygon"
          ? (g.coordinates as number[][][]).map((ring) => ring.map(round))
          : (g.coordinates as number[][][][]).map((poly) => poly.map((ring) => ring.map(round)));
      return {
        type: "Feature",
        geometry: { type: g.type, coordinates },
        properties: { fid: String(f.id ?? i) }, // rodzaj uprawy dopiero po kliknięciu (backend: /api/dzialka)
      };
    });

  const out: Out = { type: "FeatureCollection", features, rok, obcieto: features.length >= LIMIT };
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(key, out);
  return NextResponse.json(out, { headers: { "Cache-Control": "public, max-age=3600" } });
}
