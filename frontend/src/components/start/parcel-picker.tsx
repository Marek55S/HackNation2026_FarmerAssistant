"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { CROPS } from "@/lib/crops";
import type { CropId, LngLat, ParcelLookup } from "@/lib/types";
import { ICON, Icon } from "../ui";

type Mode = "id" | "name" | "map";

const MODES: { id: Mode; label: string }[] = [
  { id: "id", label: "Numer działki" },
  { id: "name", label: "Gmina, obręb, numer" },
  { id: "map", label: "Kliknij na mapie" },
];

const PickMap = dynamic(() => import("./pick-map"), {
  ssr: false,
  loading: () => <div className="grid aspect-[4/3] place-items-center rounded-[14px] bg-[#DDE7D5] text-sm text-muted sm:aspect-[16/9]">Wczytuję mapę…</div>,
});

const LAND_COVER: Record<string, string> = { las: "las", woda: "wody", zabudowa: "teren zabudowany", drogi: "drogi / nieużytki" };

const inputCls =
  "min-h-[52px] w-full rounded-xl border-2 border-rule-strong bg-paper px-4 text-lg font-semibold text-ink focus:border-primary focus:outline-none";

export function ParcelPicker({
  initialId,
  date,
  lookup,
  onLookup,
  crop,
  onCrop,
}: {
  initialId: string;
  date: string;
  lookup: ParcelLookup | null;
  onLookup: (p: ParcelLookup | null) => void;
  crop: CropId | null;
  onCrop: (c: CropId | null) => void;
}) {
  const [mode, setMode] = useState<Mode>("id");
  const [id, setId] = useState(initialId);
  const [name, setName] = useState({ gmina: "", obreb: "", nr: "" });
  const [mapPick, setMapPick] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cropEdit, setCropEdit] = useState(false);

  // Look the parcel up as the user types (backend: ULDK + crop hint for the year of the chosen date + IUNG land cover).
  useEffect(() => {
    const q =
      mode === "id"
        ? new URLSearchParams({ id: id.trim() })
        : mode === "name"
          ? new URLSearchParams({ gmina: name.gmina, obreb: name.obreb, nr: name.nr })
          : mapPick?.startsWith("xy:")
            ? (() => {
                // real crop field clicked: "xy:<lon>,<lat>;<ARiMR crop>;<year>"
                const [xy, roslina = "", rok = ""] = mapPick.split(";");
                return new URLSearchParams({ mapa: xy, roslina, rok });
              })()
            : new URLSearchParams({ mapa: mapPick ?? "" });
    q.set("data", date);
    const empty = mode === "id" ? !id.trim() : mode === "name" ? !name.obreb || !name.nr : !mapPick;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (empty) {
        onLookup(null);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/parcel?${q}`, { signal: ctrl.signal });
        const data = await res.json();
        if (res.ok) {
          onLookup(data as ParcelLookup);
          setError(null);
        } else {
          onLookup(null);
          setError(data.error);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          onLookup(null);
          setError("Brak połączenia — nie możemy sprawdzić działki. Spróbuj ponownie.");
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, mode === "map" ? 0 : 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [mode, id, name, mapPick, date, onLookup]);

  const parcel = lookup?.parcel;
  const hint = lookup?.cropHint ?? null;
  const needsCrop = !!lookup && !lookup.outOfScope && !hint && !crop;
  const showTiles = !!lookup && !lookup.outOfScope && (cropEdit || needsCrop);
  const current = crop ?? hint?.crop ?? null;
  const cropName = CROPS.find((c) => c.id === current)?.name.toLowerCase();

  return (
    <div className="flex flex-col gap-3.5">
      <div
        role="tablist"
        aria-label="Sposób wskazania działki"
        className="flex flex-wrap gap-1 self-start rounded-xl bg-chip p-1 max-sm:grid max-sm:grid-cols-3 max-sm:self-stretch"
      >
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`min-h-11 rounded-[9px] px-4 text-sm max-sm:px-1.5 max-sm:text-[13px] max-sm:leading-tight ${mode === m.id ? "bg-tab-active font-semibold text-ink shadow-sm" : "font-medium text-ink-3 hover:text-ink"}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "id" && (
        <div className="flex flex-col gap-2">
          <label htmlFor="dzialka" className="text-sm font-semibold">
            Identyfikator działki ewidencyjnej
          </label>
          <input
            id="dzialka"
            value={id}
            onChange={(e) => setId(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            className={inputCls}
            aria-invalid={!!error}
            aria-describedby="dzialka-hint"
          />
          <span id="dzialka-hint" className="text-[13px] text-muted">
            Jest w wypisie z rejestru gruntów i na geoportal.gov.pl. Format: <b className="font-semibold">141201_1.0001.123/4</b>
          </span>
        </div>
      )}

      {mode === "name" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(
            [
              ["gmina", "Gmina"],
              ["obreb", "Obręb"],
              ["nr", "Numer działki"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex flex-col gap-2 text-sm font-semibold">
              {label}
              <input value={name[k]} onChange={(e) => setName({ ...name, [k]: e.target.value })} className={inputCls} />
            </label>
          ))}
        </div>
      )}

      {mode === "map" && (
        <PickMap
          selected={mapPick}
          onPick={setMapPick}
          rok={Number(date.slice(0, 4))}
          selectedGeometry={mapPick?.startsWith("xy:") ? lookup?.parcel.geometry : undefined}
        />
      )}

      <div aria-live="polite">
        {error && <p className="rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn-ink">{error}</p>}
        {!error && loading && !lookup && <p className="text-sm text-muted">Szukamy działki…</p>}
      </div>

      {parcel && lookup && (
        <div
          className={`flex flex-col overflow-hidden rounded-[var(--r-card)] border ${lookup.outOfScope ? "border-rule-strong bg-chip" : "border-primary-border bg-primary-tint"}`}
        >
          <div className="flex flex-wrap items-center gap-3.5 p-3.5">
            <ParcelShape ring={parcel.geometry} />
            <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
              <span className={`inline-flex items-center gap-1.5 text-[15px] font-bold ${lookup.outOfScope ? "text-ink" : "text-primary"}`}>
                <Icon d={ICON.check} stroke={2.5} />
                Działka {parcel.number}
              </span>
              <span className="text-[13px] text-ink-2">
                gm. {parcel.gmina}, obręb {parcel.obreb} · {parcel.areaHa.toLocaleString("pl-PL")} ha · {parcel.landUse}
              </span>
            </div>
          </div>
          {lookup.outOfScope ? (
            <div className="flex items-start gap-3 border-t border-rule-strong bg-paper p-3.5 text-sm text-ink-2">
              <Icon d={ICON.info} size={20} className="mt-0.5 text-muted" />
              <span>
                <b className="text-ink">To nie jest grunt rolny ({LAND_COVER[parcel.landCover] ?? parcel.landCover}).</b> Ocena suszy i zalecenia
                dotyczą tylko upraw i użytków zielonych — raport pokaże, dlaczego.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 border-t border-primary-border bg-paper p-3.5">
              <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brown-tint text-brown">
                <Icon d={ICON.sprout} size={20} stroke={2.2} />
              </span>
              <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                {current ? (
                  <>
                    <span className="text-[15px]">
                      Uprawa: <b>{cropName}</b>
                    </span>
                    <span className="text-xs text-muted">
                      {crop && crop !== hint?.crop ? "wybrana przez Ciebie" : `podpowiedź: ${hint?.source} · możesz ją zmienić`}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[15px] font-semibold">Co rośnie na tej działce?</span>
                    <span className="text-xs text-muted">Brak deklaracji ARiMR i mapy upraw dla tego roku — wybierz uprawę.</span>
                  </>
                )}
              </div>
              {current && (
                <button
                  onClick={() => setCropEdit(!cropEdit)}
                  aria-expanded={cropEdit}
                  className="min-h-11 rounded-[var(--r-btn)] border border-rule-strong bg-paper px-3.5 text-sm font-semibold text-primary"
                >
                  {cropEdit ? "Zamknij" : "Zmień"}
                </button>
              )}
            </div>
          )}
          {showTiles && (
            <div className="flex flex-col gap-2.5 border-t border-primary-border bg-paper p-3.5">
              <span className="text-[13px] text-ink-3">Od uprawy zależą progi suszy i odczyt zdjęć.</span>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2">
                {CROPS.map((c) => {
                  const sel = current === c.id;
                  return (
                    <button
                      key={c.id}
                      aria-pressed={sel}
                      onClick={() => {
                        onCrop(c.id === hint?.crop ? null : c.id);
                        setCropEdit(false);
                      }}
                      className={`flex min-h-16 flex-col justify-center gap-0.5 rounded-xl px-3 py-2.5 text-left text-ink ${sel ? "border-2 border-primary bg-primary-tint" : "border border-rule-strong bg-paper hover:border-ink-3"}`}
                    >
                      <span className="text-sm font-bold">{c.name}</span>
                      <span className="text-xs text-muted">{c.hint || " "}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Thumbnail of the real parcel outline (ULDK geometry). */
function ParcelShape({ ring }: { ring: LngLat[] }) {
  const lat0 = ring[0][1];
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = ring.map((p) => p[0] * kx);
  const ys = ring.map((p) => -p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min(80 / (x1 - x0), 60 / (y1 - y0));
  const ox = (96 - (x1 - x0) * scale) / 2;
  const oy = (76 - (y1 - y0) * scale) / 2;
  const points = ring.map((_, i) => `${(ox + (xs[i] - x0) * scale).toFixed(1)},${(oy + (ys[i] - y0) * scale).toFixed(1)}`).join(" ");
  return (
    <svg width="96" height="76" viewBox="0 0 96 76" role="img" aria-label="Kształt znalezionej działki" style={{ flex: "none" }}>
      <rect width="96" height="76" rx="8" fill="#DDE8DA" />
      <polygon points={points} fill="#FFFFFF" fillOpacity="0.6" stroke="#1E5B3A" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
