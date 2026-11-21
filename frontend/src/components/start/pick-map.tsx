"use client";

// "Kliknij na mapie": crop fields (ARiMR) on the orthophoto; clicking one picks the cadastral parcel under it (ULDK via backend).
// Real parcel boundaries for the visible area come as raster tiles from GUGiK KIEG (WMS), like OSM tiles:
// only the tiles in view, only from zoom 17 (the service draws nothing below that), cached by the browser,
// and requests for tiles that left the view are cancelled by MapLibre.

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { BaseSwitch } from "../map/base-switch";
import { createMap, setBase, watchOrtho, type BaseLayer } from "../map/base-map";

/** KIEG WMS (Krajowa Integracja Ewidencji Gruntów, GUGiK): parcel boundaries + numbers, CORS allowed. */
const EWID_TILES =
  "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" +
  "&LAYERS=dzialki,numery_dzialek&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=512&HEIGHT=512";
/** Map zoom from which boundaries are requested (measured: below this KIEG returns empty images). */
const EWID_MIN_ZOOM = 17;
/** Show the loading note only when tiles take longer than this (ms). */
const SLOW_MS = 500;

/** Crop fields (ARiMR declarations) – vector, fetched for the view after the map stops moving. */
const POLA_MIN_ZOOM = 13.5; // measured: ~30 km² view, ~700 fields, ARiMR ~0.4 s
const POLA_TIMEOUT_MS = 500; // slower answer = skip (map stays responsive), next move tries again
const POLA_DEBOUNCE_MS = 200;
const POLA_GRID = 0.004; // view rounded outward to this grid (deg) so small pans hit the cache
const POLA_KOLOR = "#F07A1A"; // one highlight colour for all fields (no colour per crop)
const WYBOR_KOLOR = "#F2C14E"; // selected parcel (as in the report map)
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
type PolaStan = "zoom" | "ok" | "wolno" | "blad";

export default function PickMap({
  onPick,
  rok,
  selectedGeometry,
}: {
  /** Current pick (kept for the picker API; the highlight comes from `selectedGeometry`). */
  selected?: string | null;
  onPick: (nr: string) => void;
  rok?: number;
  /** Boundary of the real cadastral parcel picked by clicking a crop field (from ULDK). */
  selectedGeometry?: [number, number][];
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [base, setBaseState] = useState<BaseLayer>("orto");
  const [notice, setNotice] = useState<string | null>(null);
  const [zoomOk, setZoomOk] = useState(false);
  const [slow, setSlow] = useState(false);
  const [polaStan, setPolaStan] = useState<PolaStan>("zoom");
  const [polaInfo, setPolaInfo] = useState<{ n: number; rok: number | null } | null>(null);
  const rokRef = useRef(rok);
  const reloadPola = useRef<() => void>(() => {});
  useEffect(() => {
    rokRef.current = rok;
    reloadPola.current();
  }, [rok]);
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
      // Cadastral parcel boundaries + numbers (raster tiles, from zoom 17).
      map.addSource("ewidencja", {
        type: "raster",
        tiles: [EWID_TILES],
        tileSize: 512,
        minzoom: 16, // a 512 px tile at tile zoom 16 = the scale of map zoom 17
        maxzoom: 19,
        attribution: "Granice działek © GUGiK (KIEG)",
      });
      map.addLayer({
        id: "ewidencja",
        type: "raster",
        source: "ewidencja",
        minzoom: EWID_MIN_ZOOM,
        paint: { "raster-opacity": 0.95, "raster-fade-duration": 150 },
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

      // --- crop fields from ARiMR for the current view (via /api/pola)
      map.addSource("pola", { type: "geojson", data: EMPTY });
      map.addLayer(
        { id: "pola-poswiata", type: "line", source: "pola", paint: { "line-color": POLA_KOLOR, "line-width": 6, "line-blur": 4, "line-opacity": 0.35 } },
        "ewidencja",
      );
      map.addLayer({ id: "pola-fill", type: "fill", source: "pola", paint: { "fill-color": POLA_KOLOR, "fill-opacity": 0.28 } }, "ewidencja");
      map.addLayer(
        { id: "pola-linia", type: "line", source: "pola", paint: { "line-color": POLA_KOLOR, "line-width": 1.4, "line-opacity": 0.9 } },
        "ewidencja",
      );
      map.addSource("wybrana", { type: "geojson", data: EMPTY });
      map.addLayer({ id: "wybrana-obwodka", type: "line", source: "wybrana", paint: { "line-color": "#FFFFFF", "line-width": 6, "line-opacity": 0.9 } });
      map.addLayer({ id: "wybrana-linia", type: "line", source: "wybrana", paint: { "line-color": WYBOR_KOLOR, "line-width": 3.5 } });
      const cache = new Map<string, GeoJSON.FeatureCollection & { rok?: number | null }>();
      let ctrl: AbortController | null = null;
      let deb: ReturnType<typeof setTimeout> | undefined;
      const src = () => map.getSource("pola") as maplibregl.GeoJSONSource;
      const loadPola = () => {
        if (map.getZoom() < POLA_MIN_ZOOM) {
          ctrl?.abort();
          src().setData(EMPTY);
          setPolaStan("zoom");
          setPolaInfo(null);
          return;
        }
        const b = map.getBounds();
        const g = (v: number, up: boolean) => (up ? Math.ceil(v / POLA_GRID) : Math.floor(v / POLA_GRID)) * POLA_GRID;
        const bbox = [g(b.getWest(), false), g(b.getSouth(), false), g(b.getEast(), true), g(b.getNorth(), true)].map((v) => v.toFixed(3));
        const key = `${rokRef.current}|${bbox.join(",")}`;
        const hit = cache.get(key);
        if (hit) {
          src().setData(hit);
          setPolaStan("ok");
          setPolaInfo({ n: hit.features.length, rok: hit.rok ?? null });
          return;
        }
        ctrl?.abort();
        const c = new AbortController();
        ctrl = c;
        const timer = setTimeout(() => c.abort("timeout"), POLA_TIMEOUT_MS);
        fetch(`/api/pola?bbox=${bbox.join(",")}&rok=${rokRef.current ?? ""}`, { signal: c.signal })
          .then(async (r) => {
            if (r.status === 413) return setPolaStan("zoom");
            if (!r.ok) return setPolaStan("blad");
            const fc = (await r.json()) as GeoJSON.FeatureCollection & { rok?: number | null };
            cache.set(key, fc);
            if (ctrl !== c) return; // a newer view was requested meanwhile
            src().setData(fc);
            setPolaStan("ok");
            setPolaInfo({ n: fc.features.length, rok: fc.rok ?? null });
          })
          .catch(() => {
            if (c.signal.reason === "timeout") setPolaStan("wolno"); // too slow – skip, keep the previous fields
          })
          .finally(() => clearTimeout(timer));
      };
      reloadPola.current = () => {
        cache.clear();
        loadPola();
      };
      map.on("moveend", () => {
        clearTimeout(deb);
        deb = setTimeout(loadPola, POLA_DEBOUNCE_MS);
      });
      loadPola();
      // Click on a crop field = pick the cadastral parcel under that point.
      map.on("click", "pola-fill", (e) => {
        const roslina = String(e.features?.[0]?.properties?.roslina ?? "");
        const { lng, lat } = e.lngLat;
        onPickRef.current(`xy:${lng.toFixed(6)},${lat.toFixed(6)};${roslina};${rokRef.current ?? ""}`);
      });
      map.on("mouseenter", "pola-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "pola-fill", () => (map.getCanvas().style.cursor = ""));

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
    src?.setData(
      selectedGeometry && selectedGeometry.length > 2
        ? { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [selectedGeometry] } }
        : EMPTY,
    );
  }, [selectedGeometry, ready]);


  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[14px] bg-[#DDE7D5] sm:aspect-[16/9]">
      <div ref={box} style={{ position: "absolute", inset: 0 }} role="region" aria-label="Mapa: kliknij swoją działkę" />
      {ready && polaStan === "zoom" && (
        <button
          type="button"
          onClick={() => mapRef.current?.easeTo({ zoom: Math.max(POLA_MIN_ZOOM + 0.3, mapRef.current.getZoom()), duration: 600 })}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-3.5 py-2 text-[13px] font-semibold text-[#1A1C19] shadow-md"
        >
          Przybliż, aby zobaczyć pola uprawne
        </button>
      )}
      {ready && polaStan !== "zoom" && (
        <span
          role="status"
          className="absolute left-2 top-14 rounded-full bg-white/95 px-3 py-1.5 text-[12px] text-[#3F423C] shadow-md"
        >
          {polaStan === "ok" && polaInfo
            ? `Pola uprawne ARiMR ${polaInfo.rok ?? ""}: ${polaInfo.n} · kliknij pole, aby wybrać działkę`
            : polaStan === "wolno"
              ? "ARiMR odpowiada wolno — przesuń mapę, spróbujemy ponownie"
              : "Pola uprawne chwilowo niedostępne"}
        </span>
      )}
      {zoomOk && slow && (
        <span
          role="status"
          className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-white/95 px-3.5 py-2 text-[13px] text-[#3F423C] shadow-md"
        >
          Wczytuję granice działek z ewidencji…
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
