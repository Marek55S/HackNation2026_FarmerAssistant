"use client";

// Parcel map on a real basemap (Geoportal orthophoto / OpenStreetMap) with MapLibre GL.
//  - geometry (parcel, ditch, zones, 10 m rasters) are GeoJSON layers in lon/lat
//  - pins and labels are HTML markers with a fixed pixel size, so they stay readable at any zoom
// Loaded only in the browser (next/dynamic, ssr: false).

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LngLat, MapLayer, ReportMap, ReportPart, Zalecenie } from "@/lib/types";
import { BaseSwitch } from "../map/base-switch";
import { createMap, fitPadding, setBase, watchOrtho, type BaseLayer } from "../map/base-map";
import { CAT, LAYERS } from "./map-style";
import { addReportLayers, applyLayerView, applyPartView, bounds } from "./report-layers";


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
const LABEL_TONE = { ink: "text-[#1A1C19]", red: "text-[#8E1F1F]", blue: "text-[#174a57]", muted: "text-[#5F625B]" };

export default function ParcelMap({
  parcel,
  data,
  actions,
  layer,
  pin,
  onPin,
  children,
  parts = [],
  part = null,
  picked = false,
}: {
  /** The farmer has picked an action themselves (not just the preselected urgent one) */
  picked?: boolean;
  /** Crop parts of the parcel, drawn each in its own colour when there is more than one */
  parts?: ReportPart[];
  /** The part shown on its own (tab above the map); null = the whole parcel */
  part?: string | null;
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
      addReportLayers(map, parcel, data, parts);

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
    // Parts come with the same report as `data`; re-creating on them is the same as on data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    applyLayerView(map, layer, actions.find((a) => a.n === pin), picked);

    labels.current.forEach((l) => (l.el.style.display = l.layers.includes(layer) ? "" : "none"));
    pins.current.forEach((el, n) => styleSelected(el, n === pin));
  }, [layer, pin, loadedMap, actions, data, picked]);

  // One crop part on its own: its colour comes forward, the rest fades, the view zooms to it, other parts' pins hide.
  const lastPart = useRef<string | null>(null);
  useEffect(() => {
    const map = loadedMap;
    if (!map || map !== mapRef.current || !map.getLayer("czesci-wypelnienie")) return;
    applyPartView(map, layer, part);
    pins.current.forEach((el, n) => {
      const a = actions.find((x) => x.n === n);
      el.style.display = part && a?.czesc && a.czesc !== part ? "none" : "";
    });
    if (part !== lastPart.current && box.current) {
      const p = parts.find((x) => x.id === part);
      const ring = p?.geometry ? p.geometry.flat(2) : parcel;
      map.fitBounds(bounds(ring), { padding: fitPadding(box.current), maxZoom: 18, duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 });
    }
    lastPart.current = part;
  }, [part, layer, loadedMap, parts, parcel, actions, pin]);

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
