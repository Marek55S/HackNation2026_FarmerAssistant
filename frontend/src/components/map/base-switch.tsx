"use client";

import type { ReactNode } from "react";
import type { BaseLayer } from "./base-map";

/** "Zdjęcie / Mapa" switch shown over the map. */
export function BaseSwitch({
  base,
  onChange,
  notice,
  extra,
}: {
  base: BaseLayer;
  onChange: (b: BaseLayer) => void;
  notice: string | null;
  /** Extra control shown next to the switch */
  extra?: ReactNode;
}) {
  return (
    <div className="no-print pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-1.5">
      <div role="radiogroup" aria-label="Podkład mapy" className="pointer-events-auto flex rounded-lg bg-white/95 p-0.5 shadow-sm">
        {(
          [
            ["orto", "Zdjęcie"],
            ["osm", "Mapa"],
          ] as const
        ).map(([b, label]) => (
          <button
            key={b}
            role="radio"
            aria-checked={base === b}
            onClick={() => onChange(b)}
            className={`min-h-8 rounded-md px-2.5 text-xs font-semibold ${base === b ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {extra}
      </div>
      {notice && <span className="max-w-[220px] rounded-md bg-white/95 px-2 py-1 text-[11px] text-ink-2 shadow-sm">{notice}</span>}
    </div>
  );
}
