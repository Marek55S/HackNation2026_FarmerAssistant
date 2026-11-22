"use client";

// "Kliknij na mapie": wybieramy działkę ewidencyjną — jednostkę prawną i hydrologiczną, dla której liczymy
// glebę, teren i zlewnię. Podział na uprawy przychodzi dopiero po wyborze (karta działki).
// Siatka działek ma dwie warstwy, obie z ewidencji (nie z deklaracji upraw):
// 1. Granice KIEG (GUGiK, WMS) jako kafle rastrowe, przekolorowane na pomarańczowo – cała siatka widoku od razu,
//    od zoomu 13,5. KIEG rysuje granice dopiero od ~1,2 m/piksel (zmierzone: kafel z16 512 px ma granice, z15 512 px
//    jest pusty, z15 1024 px i z14 2048 px – znów są). Dla niższych zoomów pobieramy więc obraz 2×/4× większy,
//    pogrubiamy linie i pomniejszamy w przeglądarce (protokół „kieg://”), żeby nie zbladły przy pomniejszeniu.
// 2. Wypełnione „kafelki” działek z ULDK. ULDK pyta się tylko o punkt (0,35–0,7 s, jeden punkt na zapytanie),
//    więc po zatrzymaniu mapy dociągamy w tle obrysy z siatki punktów widoku; kafelki pojawiają się w miarę
//    wczytywania, a podświetlenie pod kursorem liczymy lokalnie na znanych obrysach – natychmiast, bez sieci.
// Ciężkie źródła (ARiMR, Copernicus, IUNG) idą dopiero po kliknięciu, przez /api/parcel.

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { BaseSwitch } from "../map/base-switch";
import { createMap, setBase, watchOrtho, type BaseLayer } from "../map/base-map";

/** KIEG WMS (Krajowa Integracja Ewidencji Gruntów, GUGiK): parcel boundaries + numbers, CORS allowed. */
const KIEG_WMS =
  "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" +
  "&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857";
/** Lowest tile zoom at which a 512 px KIEG image has boundaries; below it we ask for 2^(16−z) × larger images. */
const KIEG_Z_NATYWNY = 16;
/**
 * Lowest tile zoom we ask for. KIEG caps images at 4096 px (GetCapabilities MaxWidth), so z13 is the floor:
 * z13 = 4096 px, ~670 kB, ~3,2 s (measured); z12 would need four such images per tile.
 */
const KIEG_Z_MIN = 13;
/** Map zoom from which the boundary grid shows and parcels can be picked (tile zoom = round(map zoom)). */
const EWID_MIN_ZOOM = KIEG_Z_MIN - 0.5;
/** KIEG draws boundaries blue; rotate the hue to the orange of the parcel tiles (#F07A1A ≈ 27°, KIEG blue ≈ 211°). */
const EWID_HUE_ROTATE = 176;
/** Show the loading note only when tiles take longer than this (ms). */
const SLOW_MS = 500;

/** Filled parcel tiles: preload the view from this zoom (below, a view holds too many parcels for point queries). */
const KAFLE_MIN_ZOOM = 14;
/** Pointer over an unknown spot has to rest this long before we ask ULDK for the parcel under it. */
const HOVER_DEBOUNCE_MS = 100;
/** View preload: one ULDK point query per grid cell of this size (px), nearest to the pointer first. */
const WIDOK_KROK_PX = 48;
/** View preload: at most this many point queries per view, this many at a time (ULDK is a public service). */
const WIDOK_MAX = 300;
const WIDOK_ROWNOLEGLE = 6;
/** Parcel outlines kept in memory for local hit-testing and drawing. */
const ZNANE_MAX = 3000;
/** Redraw the parcel tiles at most this often while the preload streams in (ms). */
const RYSUJ_MS = 150;

const KAFEL_KOLOR = "#F07A1A";
const HOVER_KOLOR = "#FFFFFF";
const WYBOR_KOLOR = "#F2C14E"; // selected parcel (as in the report map)
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

type Ring = [number, number][];
type Dzialka = { id: string; ring: Ring; bbox: [number, number, number, number] };

const klucz = (lng: number, lat: number) => `${lng.toFixed(4)},${lat.toFixed(4)}`;

const zBbox = (p: { id: string; ring: Ring }): Dzialka => {
  const xs = p.ring.map((q) => q[0]);
  const ys = p.ring.map((q) => q[1]);
  return { ...p, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
};

/** Ray casting: is the point inside the ring? */
function inRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const asFeature = (ring: Ring): GeoJSON.Feature => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [ring] },
});

// ---------------------------------------------------------------- kafle KIEG (protokół kieg://z/x/y)
const plotno = (w: number, h: number): OffscreenCanvas | HTMLCanvasElement => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const ctx2d = (c: OffscreenCanvas | HTMLCanvasElement) => c.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Web Mercator bbox of an XYZ tile. */
function bbox3857(z: number, x: number, y: number): string {
  const R = 20037508.342789244;
  const s = (2 * R) / 2 ** z;
  return [-R + x * s, R - (y + 1) * s, -R + (x + 1) * s, R - y * s].join(",");
}

/** Zwalnia pamięć płótna od razu (4096 px = 64 MB), nie czekając na GC. */
const zwolnij = (c: OffscreenCanvas | HTMLCanvasElement) => {
  c.width = 0;
  c.height = 0;
};

/**
 * Pomniejsza obraz do 512 px krokami o połowę; przed dwoma ostatnimi krokami pogrubia linie o 1 px w poziomie
 * i pionie (rozdzielnie, 3 + 3 rysowania). Granica wychodzi ~1,5 px zamiast bladego ułamka piksela; pogrubianie
 * przy każdym kroku (z13: trzy) zlewało gęste pasy działek (sprawdzone na symulacji kafla z13). W pamięci jest
 * naraz tylko obraz źródłowy, jedno płótno tej samej wielkości i jedno o połowę mniejsze.
 */
function pomniejsz(obraz: ImageBitmap): OffscreenCanvas | HTMLCanvasElement {
  let zrodlo: ImageBitmap | OffscreenCanvas | HTMLCanvasElement = obraz;
  let n = obraz.width;
  while (n > 512) {
    const pogrub = n <= 2048; // dwa ostatnie kroki: 2048→1024 i 1024→512
    const poziom = plotno(n, n);
    const cp = ctx2d(poziom);
    for (let d = pogrub ? -1 : 0; d <= (pogrub ? 1 : 0); d++) cp.drawImage(zrodlo, d, 0);
    if (zrodlo !== obraz) zwolnij(zrodlo as OffscreenCanvas | HTMLCanvasElement);
    const pol = plotno(n / 2, n / 2);
    const cv = ctx2d(pol);
    cv.imageSmoothingEnabled = true;
    cv.imageSmoothingQuality = "high";
    for (let d = pogrub ? -1 : 0; d <= (pogrub ? 1 : 0); d++) cv.drawImage(poziom, 0, 0, n, n, 0, d / 2, n / 2, n / 2);
    zwolnij(poziom);
    zrodlo = pol;
    n /= 2;
  }
  return zrodlo as OffscreenCanvas | HTMLCanvasElement;
}

/** Duże kafle przetwarzamy po jednym (pobierają się równolegle) – kilka obrazów 4096 px naraz to setki MB. */
let kolejkaKafli: Promise<unknown> = Promise.resolve();
const poKolei = <T,>(f: () => Promise<T>): Promise<T> => {
  const wynik = kolejkaKafli.then(f, f);
  kolejkaKafli = wynik.catch(() => {});
  return wynik;
};

/**
 * Kafel granic działek. z ≥ 16: obraz 512 px wprost z KIEG (z numerami działek). Niżej: obraz 2^(16−z) × większy
 * (sama warstwa granic – numery byłyby nieczytelne), pogrubiony i pomniejszony do 512 px.
 */
const kiegKafel: maplibregl.AddProtocolAction = async (params, abort) => {
  const [z, x, y] = params.url.slice("kieg://".length).split("/").map(Number);
  const skala = 2 ** Math.max(0, KIEG_Z_NATYWNY - z);
  const px = 512 * skala;
  const warstwy = skala === 1 ? "dzialki,numery_dzialek" : "dzialki";
  const r = await fetch(`${KIEG_WMS}&LAYERS=${warstwy}&BBOX=${bbox3857(z, x, y)}&WIDTH=${px}&HEIGHT=${px}`, { signal: abort.signal });
  if (!r.ok) throw new Error(`KIEG HTTP ${r.status}`);
  const blob = await r.blob();
  if (skala === 1) return { data: await createImageBitmap(blob) };
  return poKolei(async () => {
    abort.signal.throwIfAborted(); // kafel już poza widokiem
    const obraz = await createImageBitmap(blob);
    const out = pomniejsz(obraz);
    obraz.close();
    const bmp = await createImageBitmap(out);
    zwolnij(out);
    return { data: bmp };
  });
};

let kiegZarejestrowany = false;
function zarejestrujKieg() {
  if (kiegZarejestrowany) return;
  maplibregl.addProtocol("kieg", kiegKafel);
  kiegZarejestrowany = true;
}

export default function PickMap({
  onPick,
  selectedGeometry,
}: {
  /** Current pick (kept for the picker API; the highlight comes from `selectedGeometry`). */
  selected?: string | null;
  onPick: (nr: string) => void;
  /** Boundary of the cadastral parcel the picker resolved (from ULDK). */
  selectedGeometry?: [number, number][];
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [base, setBaseState] = useState<BaseLayer>("orto");
  const [notice, setNotice] = useState<string | null>(null);
  const [zoomOk, setZoomOk] = useState(false);
  const [slow, setSlow] = useState(false);
  const [wczytuje, setWczytuje] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const selectedRef = useRef(selectedGeometry);
  useEffect(() => {
    selectedRef.current = selectedGeometry;
  }, [selectedGeometry]);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!box.current) return;
    // Start on the picked parcel (if any), otherwise on the whole of Poland.
    const g = selectedRef.current;
    const lons = g?.length ? g.map((p) => p[0]) : [14.12, 24.15];
    const lats = g?.length ? g.map((p) => p[1]) : [49.0, 54.84];
    const map = createMap(
      box.current,
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      30,
    );
    mapRef.current = map;
    const stop = watchOrtho(map, () => {
      setBaseState("osm");
      setNotice("Ortofotomapa nie odpowiada — pokazuję mapę OpenStreetMap.");
    });
    map.on("load", () => {
      // 1. Cadastral boundaries + numbers (raster tiles), recoloured orange.
      zarejestrujKieg();
      map.addSource("ewidencja", {
        type: "raster",
        tiles: ["kieg://{z}/{x}/{y}"],
        tileSize: 512,
        minzoom: KIEG_Z_MIN,
        maxzoom: 19,
        attribution: "Granice działek © GUGiK (KIEG)",
      });
      map.addLayer({
        id: "ewidencja",
        type: "raster",
        source: "ewidencja",
        minzoom: EWID_MIN_ZOOM,
        paint: { "raster-opacity": 0.95, "raster-hue-rotate": EWID_HUE_ROTATE, "raster-saturation": 0.25, "raster-fade-duration": 150 },
      });
      const onZoom = () => setZoomOk(map.getZoom() >= EWID_MIN_ZOOM);
      onZoom();
      map.on("zoomend", onZoom);
      // "Loading" note only if the boundaries take longer than SLOW_MS; cleared when the map is idle.
      let slowTimer: ReturnType<typeof setTimeout> | undefined;
      map.on("dataloading", (e) => {
        if ((e as maplibregl.MapSourceDataEvent).sourceId !== "ewidencja" || slowTimer) return;
        slowTimer = setTimeout(() => setSlow(true), SLOW_MS);
      });
      map.on("idle", () => {
        if (slowTimer) clearTimeout(slowTimer);
        slowTimer = undefined;
        setSlow(false);
      });

      // 2. Filled parcel tiles from ULDK, under the KIEG lines (the lines stay crisp on top).
      map.addSource("kafelki", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "kafelki-fill", type: "fill", source: "kafelki", paint: { "fill-color": KAFEL_KOLOR, "fill-opacity": 0.24 } }, "ewidencja");
      map.addLayer(
        { id: "kafelki-linia", type: "line", source: "kafelki", paint: { "line-color": KAFEL_KOLOR, "line-width": 1.6, "line-opacity": 0.9 } },
        "ewidencja",
      );

      // Parcel under the pointer: filled so the whole shape reads as one clickable object.
      map.addSource("pod-kursorem", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "hover-fill", type: "fill", source: "pod-kursorem", paint: { "fill-color": HOVER_KOLOR, "fill-opacity": 0.3 } });
      map.addLayer({ id: "hover-linia", type: "line", source: "pod-kursorem", paint: { "line-color": HOVER_KOLOR, "line-width": 2.5 } });
      // Picked parcel – drawn at once from the hovered shape, before the picker's lookup answers.
      map.addSource("wybrana", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "wybrana-obwodka", type: "line", source: "wybrana", paint: { "line-color": "#FFFFFF", "line-width": 6, "line-opacity": 0.9 } });
      map.addLayer({ id: "wybrana-wypelnienie", type: "fill", source: "wybrana", paint: { "fill-color": WYBOR_KOLOR, "fill-opacity": 0.2 } });
      map.addLayer({ id: "wybrana-linia", type: "line", source: "wybrana", paint: { "line-color": WYBOR_KOLOR, "line-width": 3.5 } });

      const src = (id: string) => map.getSource(id) as maplibregl.GeoJSONSource;
      // Wszystkie pobrane obrysy: kursor sprawdzamy na nich lokalnie, bez sieci; one też są kafelkami.
      const znane = new Map<string, Dzialka>();
      const puste = new Set<string>(); // punkty, pod którymi ULDK nie ma działki
      let hover: Dzialka | null = null;
      let kursor: [number, number] | null = null;
      let ctrl: AbortController | null = null;
      let deb: ReturnType<typeof setTimeout> | undefined;

      let rysujTimer: ReturnType<typeof setTimeout> | undefined;
      const rysujKafelki = () => {
        if (rysujTimer) return;
        rysujTimer = setTimeout(() => {
          rysujTimer = undefined;
          src("kafelki").setData({ type: "FeatureCollection", features: [...znane.values()].map((d) => asFeature(d.ring)) });
        }, RYSUJ_MS);
      };

      const znajdz = (lng: number, lat: number): Dzialka | null => {
        for (const d of znane.values()) {
          const [x0, y0, x1, y1] = d.bbox;
          if (lng >= x0 && lng <= x1 && lat >= y0 && lat <= y1 && inRing(lng, lat, d.ring)) return d;
        }
        return null;
      };

      const pokaz = (p: Dzialka | null) => {
        if (hover?.id === p?.id) return;
        hover = p;
        setHoverId(p?.id ?? null);
        src("pod-kursorem").setData(p ? asFeature(p.ring) : EMPTY);
        map.getCanvas().style.cursor = p ? "pointer" : "";
      };

      /** Nowy obrys mógł przykryć punkt, nad którym stoi kursor. */
      const odswiez = () => {
        if (!kursor || hover || map.getZoom() < EWID_MIN_ZOOM) return;
        const d = znajdz(kursor[0], kursor[1]);
        if (d) pokaz(d);
      };

      const pobierz = async (lng: number, lat: number, signal?: AbortSignal) => {
        const r = await fetch(`/api/dzialka-hover?lon=${lng.toFixed(6)}&lat=${lat.toFixed(6)}`, { signal });
        if (r.status === 404) puste.add(klucz(lng, lat));
        if (!r.ok) return;
        const p = (await r.json()) as { id: string; ring: Ring };
        if (!znane.has(p.id)) {
          if (znane.size >= ZNANE_MAX) znane.delete(znane.keys().next().value as string);
          znane.set(p.id, zBbox(p));
          rysujKafelki();
        }
        odswiez();
      };

      // Kursor nad nieznanym miejscem: pytamy od razu o ten punkt, poza kolejką wczytywania widoku.
      const szukaj = (lng: number, lat: number) => {
        if (puste.has(klucz(lng, lat))) return;
        ctrl?.abort();
        const c = new AbortController();
        ctrl = c;
        pobierz(lng, lat, c.signal).catch(() => {
          /* anulowane nowszym ruchem albo ULDK nie odpowiada */
        });
      };

      // Wczytywanie widoku: ULDK zna tylko punkt, więc pytamy o siatkę punktów widoku, od kursora na zewnątrz,
      // pomijając punkty leżące w już znanych działkach (jedna duża działka = jedno zapytanie).
      let kolejka: [number, number][] = [];
      let aktywne = 0;
      let bylo = false;
      const stan = () => {
        const teraz = aktywne > 0 || kolejka.length > 0;
        if (teraz !== bylo) setWczytuje((bylo = teraz));
      };
      const pompuj = () => {
        while (aktywne < WIDOK_ROWNOLEGLE && kolejka.length) {
          const [lng, lat] = kolejka.shift()!;
          if (puste.has(klucz(lng, lat)) || znajdz(lng, lat)) continue;
          aktywne++;
          pobierz(lng, lat)
            .catch(() => {})
            .finally(() => {
              aktywne--;
              pompuj();
            });
        }
        stan();
      };
      const wczytajWidok = () => {
        kolejka = [];
        if (map.getZoom() < KAFLE_MIN_ZOOM) return stan();
        const { clientWidth: w, clientHeight: h } = map.getContainer();
        const c = kursor ? map.project(kursor) : { x: w / 2, y: h / 2 };
        const pkt: { x: number; y: number; d: number }[] = [];
        for (let x = WIDOK_KROK_PX / 2; x < w; x += WIDOK_KROK_PX)
          for (let y = WIDOK_KROK_PX / 2; y < h; y += WIDOK_KROK_PX) pkt.push({ x, y, d: (x - c.x) ** 2 + (y - c.y) ** 2 });
        kolejka = pkt
          .sort((a, b) => a.d - b.d)
          .slice(0, WIDOK_MAX)
          .map(({ x, y }) => {
            const ll = map.unproject([x, y]);
            return [ll.lng, ll.lat] as [number, number];
          });
        pompuj();
      };
      map.on("movestart", () => {
        kolejka = [];
        stan();
      });
      map.on("moveend", wczytajWidok);
      wczytajWidok();

      map.on("mousemove", (e) => {
        const { lng, lat } = e.lngLat;
        kursor = [lng, lat];
        clearTimeout(deb);
        if (map.getZoom() < EWID_MIN_ZOOM) return pokaz(null);
        const d = znajdz(lng, lat);
        if (d) {
          ctrl?.abort();
          return pokaz(d);
        }
        pokaz(null);
        deb = setTimeout(() => szukaj(lng, lat), HOVER_DEBOUNCE_MS);
      });
      map.on("mouseout", () => {
        clearTimeout(deb);
        kursor = null;
        pokaz(null);
      });
      map.on("click", (e) => {
        if (map.getZoom() < EWID_MIN_ZOOM) return; // bez widocznej siatki klik trafiałby w przypadkową działkę
        const { lng, lat } = e.lngLat;
        // Na dotyku nie ma najazdu kursorem – obrys pokazujemy ze znanych działek, zanim odpowie wyszukiwanie działki.
        const d = hover ?? znajdz(lng, lat);
        if (d) src("wybrana").setData(asFeature(d.ring));
        else szukaj(lng, lat);
        onPickRef.current(`xy:${lng.toFixed(6)},${lat.toFixed(6)}`);
      });

      setReady(true);
    });
    return () => {
      stop();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("wybrana") as maplibregl.GeoJSONSource | undefined;
    src?.setData(selectedGeometry && selectedGeometry.length > 2 ? asFeature(selectedGeometry as Ring) : EMPTY);
  }, [selectedGeometry, ready]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[14px] bg-[#DDE7D5] sm:aspect-[16/9]">
      <div ref={box} style={{ position: "absolute", inset: 0 }} role="region" aria-label="Mapa: kliknij swoją działkę ewidencyjną" />
      {ready && !zoomOk && (
        <button
          type="button"
          onClick={() => mapRef.current?.easeTo({ zoom: Math.max(KAFLE_MIN_ZOOM, mapRef.current.getZoom()), duration: 600 })}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-3.5 py-2 text-[13px] font-semibold text-[#1A1C19] shadow-md"
        >
          Przybliż, aby zobaczyć działki
        </button>
      )}
      {ready && zoomOk && (
        <span role="status" className="absolute left-2 top-14 max-w-[min(320px,70%)] rounded-full bg-white/95 px-3 py-1.5 text-[12px] text-[#3F423C] shadow-md">
          {hoverId ? `Działka ${hoverId.split(".").pop()} — kliknij, aby wybrać` : "Najedź na działkę i kliknij, aby ją wybrać"}
        </span>
      )}
      {zoomOk && (slow || wczytuje) && (
        <span role="status" className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-3.5 py-2 text-[13px] text-[#3F423C] shadow-md">
          Wczytuję działki z ewidencji…
        </span>
      )}
      <BaseSwitch
        base={base}
        notice={notice}
        onChange={(b) => {
          setBaseState(b);
          setNotice(null);
          if (mapRef.current) setBase(mapRef.current, b);
        }}
      />
    </div>
  );
}
