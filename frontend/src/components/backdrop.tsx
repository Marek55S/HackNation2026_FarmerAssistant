"use client";

// Start-screen background: a real aerial photo of farmland (Geoportal orthophoto, Kujawy) under a paper veil,
// with a very slow zoom. Tiles are fetched in the browser once the viewport size is known.

import { useEffect, useState } from "react";
import { ORTO_TILES } from "./map/tiles";

const CENTER = { lat: 52.69, lon: 18.29, z: 15 };
const TILE = 256;

function tileXY(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

export function Backdrop() {
  const [grid, setGrid] = useState<{ cols: number; rows: number } | null>(null);
  useEffect(() => {
    // Enough tiles to cover the viewport with room for the slow zoom; the viewport is known only in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGrid({ cols: Math.ceil((innerWidth * 1.15) / TILE) + 1, rows: Math.ceil((innerHeight * 1.15) / TILE) + 1 });
  }, []);

  const tiles = [];
  if (grid) {
    const c = tileXY(CENTER.lat, CENTER.lon, CENTER.z);
    const x0 = Math.floor(c.x - grid.cols / 2);
    const y0 = Math.floor(c.y - grid.rows / 2);
    for (let r = 0; r < grid.rows; r++)
      for (let k = 0; k < grid.cols; k++) {
        const src = ORTO_TILES.replace("{z}", String(CENTER.z)).replace("{x}", String(x0 + k)).replace("{y}", String(y0 + r));
        // Plain <img>: decorative WMTS tiles from an external server, no Next image optimisation wanted.
        // eslint-disable-next-line @next/next/no-img-element
        tiles.push(<img key={`${r}-${k}`} src={src} alt="" width={TILE} height={TILE} className="bd-tile block" decoding="async" onLoad={(e) => e.currentTarget.classList.add("is-loaded")} />);
      }
  }

  return (
    <div aria-hidden className="bd pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {grid && (
        <div
          className="bd-photo absolute left-1/2 top-1/2 grid"
          style={{
            gridTemplateColumns: `repeat(${grid.cols}, ${TILE}px)`,
            width: grid.cols * TILE,
            marginLeft: -(grid.cols * TILE) / 2,
            marginTop: -(grid.rows * TILE) / 2,
          }}
        >
          {tiles}
        </div>
      )}
      <div className="bd-veil absolute inset-0" />
      <span className="absolute bottom-2 right-3 text-[10px] text-muted max-md:bottom-20">Ortofotomapa © GUGiK</span>
    </div>
  );
}
