"use client";

// Parcel map on a real basemap (Geoportal orthophoto / OpenStreetMap) with MapLibre GL.
//  - geometry (parcel, ditch, zones, 10 m rasters) are GeoJSON layers in lon/lat
//  - pins and labels are HTML markers with a fixed pixel size, so they stay readable at any zoom
// Loaded only in the browser (next/dynamic, ssr: false).

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type ExpressionSpecification } from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LngLat, MapLayer, RasterGrid, ReportMap, Zalecenie } from "@/lib/types";
import { BaseSwitch } from "../map/base-switch";
import { createMap, fitPadding, setBase, watchOrtho, type BaseLayer } from "../map/base-map";
import { CAT, LAYERS, RASTER_RGBA } from "./map-style";


// Selected recommendation: a white halo, which reads on the photo without adding another colour.
// Field boundary: yellow, as in FarmSense.
const HL = "#FFFFFF";
const FIELD = "#F2C14E";

function bounds(ring: LngLat[]): [LngLat, LngLat] {
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

const RASTER_KEYS = ["sucho", "teren", "gleba"] as const;

/**
 * Raster grid → PNG for an image source. The grid (one pixel per cell) is scaled up with smoothing, so 10 m
 * cells read as a smooth field instead of hard squares, and then cut exactly to the parcel boundary
 * (nothing sticks out beyond the parcel).
 */
function rasterImage(g: RasterGrid, palette: [number, number, number, number][], ring: LngLat[]): string {
  const small = document.createElement("canvas");
  small.width = g.cols;
  small.height = g.rows;
  const sctx = small.getContext("2d")!;
  const img = sctx.createImageData(g.cols, g.rows);
  g.values.forEach((v, k) => {
    const [r, gr, b, a] = v >= 0 ? palette[v] ?? [0, 0, 0, 0] : [0, 0, 0, 0];
    img.data.set([r, gr, b, Math.round(a * 255)], k * 4);
  });
  sctx.putImageData(img, 0, 0);

  const scale = Math.max(1, Math.min(16, Math.floor(1024 / Math.max(g.cols, g.rows))));
  const c = document.createElement("canvas");
  c.width = g.cols * scale;
  c.height = g.rows * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, c.width, c.height);
  if (ring.length >= 3) {
    // keep only the part inside the parcel (lon/lat → canvas pixels over the raster bbox)
    const [w, s, e, n] = g.bbox;
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ring.forEach(([lon, lat], i) => {
      const x = ((lon - w) / (e - w)) * c.width;
      const y = ((n - lat) / (n - s)) * c.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }
  return c.toDataURL("image/png");
}

const corners = (g: RasterGrid): [[number, number], [number, number], [number, number], [number, number]] => {
  const [w, s, e, n] = g.bbox;
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
};

/** Pin button element (fixed size, keyboard accessible). */
function pinElement(a: Zalecenie, onClick: () => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = String(a.n);
  el.setAttribute("aria-label", `${a.n}. ${a.co}`);
  el.style.background = CAT[a.kategoria].color;
  el.className =
    "inline-flex items-center justify-center rounded-full border-[3px] border-white p-0 font-extrabold text-white transition-[width,height] h-8 w-8 text-sm sm:h-9 sm:w-9 shadow-[0_2px_6px_rgba(0,0,0,0.35)]";
  el.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return el;
}

function styleSelected(el: HTMLElement, selected: boolean) {
  el.setAttribute("aria-pressed", String(selected));
  el.style.boxShadow = selected ? "0 0 0 3px #1A1C19, 0 4px 10px rgba(0,0,0,0.35)" : "0 2px 6px rgba(0,0,0,0.35)";
  el.style.width = el.style.height = selected ? "44px" : "";
  el.style.fontSize = selected ? "17px" : "";
  el.style.zIndex = selected ? "2" : "1";
}

// Labels sit on the photo, so they keep the same light chip in both looks.
const LABEL_TONE = { ink: "text-[#1A1C19]", red: "text-[#8E1F1F]", blue: "text-[#123f78]", muted: "text-[#5F625B]" };

export default function ParcelMap({
  parcel,
  data,
  actions,
  layer,
  pin,
  onPin,
  children,
}: {
  /** Floating panel rendered over the map (top-right on tablets and up) */
  children?: ReactNode;
  parcel: LngLat[];
  data: ReportMap;
  actions: Zalecenie[];
  layer: MapLayer;
  pin: number;
  onPin: (a: Zalecenie) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // The map instance whose style has finished loading (not just "a map is ready"): when the parcel or data changes,
  // the map is re-created and the effects below must not touch the new one before its own "load".
  const [loadedMap, setLoadedMap] = useState<maplibregl.Map | null>(null);
  const ready = !!loadedMap;
  const [base, setBaseState] = useState<BaseLayer>("orto");
  const [notice, setNotice] = useState<string | null>(null);
  const pins = useRef(new Map<number, HTMLElement>());
  const labels = useRef<{ el: HTMLElement; layers: MapLayer[] }[]>([]);
  const onPinRef = useRef(onPin);
  useEffect(() => {
    onPinRef.current = onPin;
  }, [onPin]);

  // Create the map once per parcel.
  useEffect(() => {
    if (!box.current) return;
    const pinEls = pins.current;
    const map = createMap(box.current, bounds(parcel));
    mapRef.current = map;
    const stopWatch = watchOrtho(map, () => {
      setBaseState("osm");
      setNotice("Ortofotomapa nie odpowiada — pokazuję mapę OpenStreetMap.");
    });

    map.on("load", () => {
      const ring = [...parcel];
      map.addSource("pole", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } } });
      // One image source + layer per raster view, toggled by visibility (swapping data in one source left stale tiles at high zoom).
      for (const k of RASTER_KEYS) {
        const g = data.rasters[k];
        if (g) map.addSource(`raster-${k}`, { type: "image", url: rasterImage(g, RASTER_RGBA[k], parcel), coordinates: corners(g) });
      }
      map.addSource("obiekty", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: data.features.map((f) => ({
            type: "Feature",
            properties: { kind: f.kind, regula: f.regula ?? "", ls: `,${f.layers.join(",")},` },
            geometry: f.geometry,
          })),
        },
      });

      map.addLayer({ id: "pole-wypelnienie", type: "fill", source: "pole", paint: { "fill-color": FIELD, "fill-opacity": 0.14 } });
      for (const k of RASTER_KEYS) {
        if (!data.rasters[k]) continue;
        map.addLayer({
          id: `raster-${k}`,
          type: "raster",
          source: `raster-${k}`,
          layout: { visibility: "none" },
          paint: { "raster-opacity": 1, "raster-resampling": "linear", "raster-fade-duration": 0 },
        });
      }
      map.addLayer({ id: "strefa", type: "fill", source: "obiekty", filter: ["==", ["get", "kind"], "strefa-podlewania"], paint: { "fill-color": "#2a78d6", "fill-opacity": 0.22 } });
      map.addLayer({ id: "zaglebienie", type: "fill", source: "obiekty", filter: ["==", ["get", "kind"], "zaglebienie"], paint: { "fill-color": "#9ec5f4", "fill-opacity": 0.75 } });
      map.addLayer({
        id: "wyroznienie",
        type: "line",
        source: "obiekty",
        filter: ["==", ["get", "regula"], "-"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": HL, "line-width": 9, "line-opacity": 0.85, "line-blur": 1.5 },
      });
      map.addLayer({ id: "strefa-linia", type: "line", source: "obiekty", filter: ["==", ["get", "kind"], "strefa-podlewania"], paint: { "line-color": "#1f6fc9", "line-width": 2, "line-dasharray": [3, 2] } });
      map.addLayer({ id: "zaglebienie-linia", type: "line", source: "obiekty", filter: ["==", ["get", "kind"], "zaglebienie"], paint: { "line-color": "#123f78", "line-width": 2, "line-dasharray": [2, 1.5] } });
      map.addLayer({
        id: "pas",
        type: "line",
        source: "obiekty",
        filter: ["==", ["get", "kind"], "pas-zadrzewien"],
        layout: { "line-cap": "round" },
        paint: { "line-color": "#3F7D3A", "line-width": 8, "line-dasharray": [0.1, 1.6] },
      });
      map.addLayer({
        id: "row",
        type: "line",
        source: "obiekty",
        filter: ["==", ["get", "kind"], "row"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#1f6fc9", "line-width": 4 },
      });
      map.addLayer({
        id: "splyw",
        type: "line",
        source: "obiekty",
        filter: ["==", ["get", "kind"], "splyw"],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#123f78", "line-width": 3 },
      });
      map.addLayer({ id: "pole-obwodka", type: "line", source: "pole", paint: { "line-color": "#1A1C19", "line-width": 5, "line-opacity": 0.35 } });
      map.addLayer({ id: "pole", type: "line", source: "pole", layout: { "line-join": "round" }, paint: { "line-color": FIELD, "line-width": 2.5 } });

      // Labels (fixed size HTML markers)
      labels.current = data.labels.map((l) => {
        const el = document.createElement("span");
        el.textContent = l.text;
        el.className = `pointer-events-none whitespace-nowrap rounded bg-white/90 px-1.5 py-1 text-[11px] font-bold leading-none shadow-sm sm:text-xs ${LABEL_TONE[l.tone]} ${l.minor ? "max-sm:hidden" : ""}`;
        new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(l.punkt).addTo(map);
        return { el, layers: l.layers };
      });
      setLoadedMap(map);
    });

    return () => {
      stopWatch();
      pinEls.clear();
      map.remove();
      mapRef.current = null;
      setLoadedMap(null);
    };
  }, [parcel, data]);

  // Pins
  useEffect(() => {
    const map = loadedMap;
    if (!map || map !== mapRef.current) return;
    const pinEls = pins.current;
    const markers = actions.map((a) => {
      const el = pinElement(a, () => onPinRef.current(a));
      pinEls.set(a.n, el);
      return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(a.punkt).addTo(map);
    });
    return () => {
      markers.forEach((m) => m.remove());
      pinEls.clear();
    };
  }, [actions, loadedMap]);

  // Map view (layer) and selection
  useEffect(() => {
    const map = loadedMap;
    if (!map || map !== mapRef.current) return;
    const inLayer: ExpressionSpecification = ["in", `,${layer},`, ["get", "ls"]];
    for (const id of ["strefa", "zaglebienie", "strefa-linia", "zaglebienie-linia", "pas", "row", "splyw"]) {
      const kind = { strefa: "strefa-podlewania", "strefa-linia": "strefa-podlewania", zaglebienie: "zaglebienie", "zaglebienie-linia": "zaglebienie", pas: "pas-zadrzewien", row: "row", splyw: "splyw" }[id]!;
      // The depression is filled only on the action plan; on the terrain view it is just outlined.
      if (id === "zaglebienie" && layer !== "plan") {
        map.setFilter(id, ["==", ["get", "kind"], "-"]);
        continue;
      }
      map.setFilter(id, ["all", ["==", ["get", "kind"], kind], inLayer]);
    }
    for (const k of RASTER_KEYS) if (map.getLayer(`raster-${k}`)) map.setLayoutProperty(`raster-${k}`, "visibility", k === layer ? "visible" : "none");

    const sel = actions.find((a) => a.n === pin);
    const rule = sel?.regula === "R8" ? "R7" : (sel?.regula ?? "-");
    map.setFilter("wyroznienie", ["==", ["get", "regula"], rule]);
    map.setPaintProperty("pole", "line-color", sel?.regula === "R5" ? HL : FIELD);
    map.setPaintProperty("pole", "line-width", sel?.regula === "R5" ? 5 : 2.5);
    map.setLayoutProperty("pole-wypelnienie", "visibility", layer === "plan" ? "visible" : "none");

    labels.current.forEach((l) => (l.el.style.display = l.layers.includes(layer) ? "" : "none"));
    pins.current.forEach((el, n) => styleSelected(el, n === pin));
  }, [layer, pin, loadedMap, actions, data]);

  const sel = actions.find((a) => a.n === pin);
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[14px] bg-[#DDE7D5] sm:aspect-[3/2]">
      <div
        ref={box}
        // Inline style: maplibre-gl.css sets `.maplibregl-map { position: relative }`, which would override a class.
        style={{ position: "absolute", inset: 0 }}
        role="region"
        aria-label={`Mapa działki na zdjęciu lotniczym, widok: ${LAYERS[layer]}${sel ? `. Zaznaczone działanie ${sel.n}: ${sel.co}` : ""}`}
      />
      <BaseSwitch
        base={base}
        notice={notice}
        onChange={(b) => {
          setBaseState(b);
          setNotice(null);
          if (mapRef.current) setBase(mapRef.current, b);
        }}
        extra={
          <button
            onClick={() => box.current && mapRef.current?.fitBounds(bounds(parcel), { padding: fitPadding(box.current), maxZoom: 18 })}
            className="pointer-events-auto min-h-9 rounded-lg bg-white/95 px-2.5 text-xs font-semibold text-[#1A1C19] shadow-sm hover:bg-white"
          >
            Cała działka
          </button>
        }
      />
      {children}
      {!ready && <span className="absolute inset-0 grid place-items-center text-sm text-muted">Wczytuję mapę…</span>}
    </div>
  );
}
