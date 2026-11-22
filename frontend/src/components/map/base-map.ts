// Shared MapLibre setup: Geoportal orthophoto (GUGiK WMTS, EPSG:3857, free, no key) with an OpenStreetMap fallback.

import maplibregl, { type LngLatBoundsLike, type StyleSpecification } from "maplibre-gl";
import { ORTO_TILES } from "./tiles";

export type BaseLayer = "orto" | "osm";

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    orto: { type: "raster", tiles: [ORTO_TILES], tileSize: 256, maxzoom: 19, attribution: "Ortofotomapa © GUGiK (geoportal.gov.pl)" },
    osm: { type: "raster", tiles: [OSM_TILES], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#DDE7D5" } },
    { id: "orto", type: "raster", source: "orto" },
    { id: "osm", type: "raster", source: "osm", layout: { visibility: "none" } },
  ],
};

const LOCALE_PL: Record<string, string> = {
  "AttributionControl.ToggleAttribution": "Pokaż źródła mapy",
  "Map.Title": "Mapa",
  "Marker.Title": "Znacznik",
  "NavigationControl.ResetBearing": "Obróć na północ",
  "NavigationControl.ZoomIn": "Przybliż",
  "NavigationControl.ZoomOut": "Oddal",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
  "CooperativeGesturesHandler.WindowsHelpText": "Użyj Ctrl + przewijania, aby przybliżyć mapę",
  "CooperativeGesturesHandler.MacHelpText": "Użyj ⌘ + przewijania, aby przybliżyć mapę",
  "CooperativeGesturesHandler.MobileHelpText": "Przesuwaj mapę dwoma palcami",
};

/** Margin around the parcel when fitting it into view: smaller on phones. */
export const fitPadding = (el: HTMLElement) => (el.clientWidth < 500 ? 20 : 40);

export function createMap(container: HTMLElement, bounds: LngLatBoundsLike, padding = fitPadding(container)): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: STYLE,
    bounds,
    fitBoundsOptions: { padding, maxZoom: 18 },
    maxZoom: 19,
    // Page scroll keeps working; zoom with Ctrl + wheel or two fingers.
    cooperativeGestures: true,
    attributionControl: { compact: true },
    locale: LOCALE_PL,
    dragRotate: false,
    pitchWithRotate: false,
    // Needed so the map shows up when the report is printed / saved as PDF.
    canvasContextAttributes: { preserveDrawingBuffer: true },
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 90 }), "bottom-left");
  return map;
}

export function setBase(map: maplibregl.Map, base: BaseLayer) {
  const apply = () => {
    map.setLayoutProperty("orto", "visibility", base === "orto" ? "visible" : "none");
    map.setLayoutProperty("osm", "visibility", base === "osm" ? "visible" : "none");
  };
  if (map.isStyleLoaded()) apply();
  else map.once("load", apply);
}

/**
 * Switches to OpenStreetMap when the orthophoto does not deliver any tile within `ms`
 * (Geoportal is sometimes slow). Returns a cleanup function.
 */
export function watchOrtho(map: maplibregl.Map, onFallback: () => void, ms = 6000): () => void {
  let loaded = false;
  let errors = 0;
  const onData = (e: maplibregl.MapSourceDataEvent) => {
    if (e.sourceId === "orto" && e.tile) loaded = true;
  };
  const fallback = () => {
    if (loaded) return;
    setBase(map, "osm");
    onFallback();
    cleanup();
  };
  const onError = (e: maplibregl.ErrorEvent & { sourceId?: string }) => {
    if (e.sourceId === "orto" && ++errors >= 4) fallback();
  };
  // Count the time from when the map is ready to draw, not from page load.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const start = () => (timer = setTimeout(fallback, ms));
  if (map.isStyleLoaded()) start();
  else map.once("load", start);
  map.on("sourcedata", onData);
  map.on("error", onError);
  function cleanup() {
    if (timer) clearTimeout(timer);
    map.off("load", start);
    map.off("sourcedata", onData);
    map.off("error", onError);
  }
  return cleanup;
}
