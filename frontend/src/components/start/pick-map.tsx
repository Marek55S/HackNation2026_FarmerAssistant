"use client";

// "Kliknij na mapie": demo parcels on the orthophoto; clicking one selects it (stand-in for ULDK GetParcelByXY).

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { demoParcels } from "@/lib/mock/parcels";
import { BaseSwitch } from "../map/base-switch";
import { createMap, setBase, watchOrtho, type BaseLayer } from "../map/base-map";

export default function PickMap({ selected, onPick }: { selected: string | null; onPick: (nr: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [base, setBaseState] = useState<BaseLayer>("orto");
  const [notice, setNotice] = useState<string | null>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!box.current) return;
    const parcels = demoParcels();
    const all = parcels.flatMap((p) => p.geometry);
    const lons = all.map((p) => p[0]);
    const lats = all.map((p) => p[1]);
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
      map.addSource("dzialki", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: parcels.map((p) => ({
            type: "Feature",
            properties: { nr: p.number },
            geometry: { type: "Polygon", coordinates: [p.geometry] },
          })),
        },
      });
      map.addLayer({ id: "dzialki-fill", type: "fill", source: "dzialki", paint: { "fill-color": "#FFFFFF", "fill-opacity": 0.15 } });
      map.addLayer({ id: "dzialki-obwodka", type: "line", source: "dzialki", paint: { "line-color": "#FFFFFF", "line-width": 4, "line-opacity": 0.9 } });
      map.addLayer({ id: "dzialki-linia", type: "line", source: "dzialki", paint: { "line-color": "#1E5B3A", "line-width": 2 } });
      map.on("click", "dzialki-fill", (e) => {
        const nr = e.features?.[0]?.properties?.nr;
        if (typeof nr === "string") onPickRef.current(nr);
      });
      map.on("mouseenter", "dzialki-fill", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "dzialki-fill", () => (map.getCanvas().style.cursor = ""));
      // Keyboard alternative: a button per parcel at its centre.
      parcels.forEach((p) => {
        const pts = p.geometry.slice(0, -1);
        const c: [number, number] = [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
        const el = document.createElement("button");
        el.type = "button";
        el.dataset.nr = p.number;
        el.textContent = p.number;
        el.setAttribute("aria-label", `Wybierz działkę ${p.number}, obręb ${p.obreb}`);
        el.className = "rounded-md bg-white/95 px-2 py-1 text-xs font-bold text-ink shadow-sm";
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onPickRef.current(p.number);
        });
        new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(c).addTo(map);
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
    map.setPaintProperty("dzialki-linia", "line-color", ["case", ["==", ["get", "nr"], selected ?? ""], "#F2B53A", "#1E5B3A"]);
    map.setPaintProperty("dzialki-linia", "line-width", ["case", ["==", ["get", "nr"], selected ?? ""], 4, 2]);
    map.getContainer().querySelectorAll<HTMLButtonElement>("button[data-nr]").forEach((b) => {
      const sel = b.dataset.nr === selected;
      b.setAttribute("aria-pressed", String(sel));
      b.className = `rounded-md px-2 py-1 text-xs font-bold shadow-sm ${sel ? "bg-primary text-white" : "bg-white/95 text-ink"}`;
    });
  }, [selected, ready]);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[14px] bg-[#DDE7D5] sm:aspect-[16/9]">
      <div ref={box} style={{ position: "absolute", inset: 0 }} role="region" aria-label="Mapa: kliknij swoją działkę" />
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
