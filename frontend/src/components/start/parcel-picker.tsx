"use client";

import { useEffect, useState } from "react";
import { CROPS } from "@/lib/mock/parcels";
import type { CropId, Parcel } from "@/lib/types";
import { ICON, Icon } from "../ui";

type Mode = "id" | "name" | "map";

const MODES: { id: Mode; label: string }[] = [
  { id: "id", label: "Numer działki" },
  { id: "name", label: "Gmina, obręb, numer" },
  { id: "map", label: "Kliknij na mapie" },
];

const inputCls =
  "min-h-[52px] w-full rounded-xl border-2 border-rule-strong bg-paper px-4 text-lg font-semibold text-ink focus:border-primary focus:outline-none";

export function ParcelPicker({
  initialId,
  parcel,
  onParcel,
  crop,
  onCrop,
}: {
  initialId: string;
  parcel: Parcel | null;
  onParcel: (p: Parcel | null) => void;
  crop: CropId | null;
  onCrop: (c: CropId | null) => void;
}) {
  const [mode, setMode] = useState<Mode>("id");
  const [id, setId] = useState(initialId);
  const [name, setName] = useState({ gmina: "Szubin", obreb: "Godzimierz", nr: "245/3" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cropEdit, setCropEdit] = useState(false);

  // Look the parcel up as the user types (mock of ULDK).
  useEffect(() => {
    if (mode === "map") return;
    const q =
      mode === "id"
        ? new URLSearchParams({ id })
        : new URLSearchParams({ gmina: name.gmina, obreb: name.obreb, nr: name.nr });
    const empty = mode === "id" ? !id.trim() : !name.gmina || !name.obreb || !name.nr;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (empty) {
        onParcel(null);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/parcel?${q}`, { signal: ctrl.signal });
        const data = await res.json();
        if (res.ok) {
          onParcel(data.parcel);
          setError(null);
        } else {
          onParcel(null);
          setError(data.error);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Brak połączenia — spróbuj ponownie.");
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [mode, id, name, onParcel]);

  async function pickOnMap(x: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/parcel?x=${x}`);
      const data = await res.json();
      onParcel(res.ok ? data.parcel : null);
      setError(res.ok ? null : data.error);
    } finally {
      setLoading(false);
    }
  }

  const cropName = CROPS.find((c) => c.id === (crop ?? parcel?.detectedCrop))?.name.toLowerCase();

  return (
    <div className="flex flex-col gap-3.5">
      <div role="tablist" aria-label="Sposób wskazania działki" className="flex flex-wrap gap-1 self-start rounded-xl bg-chip p-1 max-sm:grid max-sm:grid-cols-3 max-sm:self-stretch">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={`min-h-11 rounded-[9px] px-4 text-sm max-sm:px-1.5 max-sm:text-[13px] max-sm:leading-tight ${mode === m.id ? "bg-paper font-semibold text-ink shadow-sm" : "font-medium text-ink-3"}`}
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
            inputMode="text"
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

      {mode === "map" && <PickMap selected={parcel?.number ?? null} onPick={pickOnMap} />}

      <div aria-live="polite">
        {error && <p className="rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn-ink">{error}</p>}
        {!error && loading && !parcel && <p className="text-sm text-muted">Szukamy działki…</p>}
      </div>

      {parcel && (
        <div className="flex flex-col overflow-hidden rounded-[14px] border border-primary-border bg-primary-tint">
          <div className="flex flex-wrap items-center gap-3.5 p-3.5">
            <ParcelShape />
            <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5 text-[15px] font-bold text-primary">
                <Icon d={ICON.check} stroke={2.5} />
                Działka {parcel.number}
              </span>
              <span className="text-[13px] text-ink-2">
                gm. {parcel.gmina}, obręb {parcel.obreb} · {parcel.areaHa.toLocaleString("pl-PL")} ha · {parcel.landUse}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-primary-border bg-paper p-3.5">
            <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brown-tint text-brown">
              <Icon d={ICON.sprout} size={20} stroke={2.2} />
            </span>
            <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
              <span className="text-[15px]">
                Uprawa: <b>{cropName}</b>
              </span>
              <span className="text-xs text-muted">
                {crop ? "wybrane przez Ciebie" : `wykryte automatycznie: ${parcel.cropSource}`}
              </span>
            </div>
            <button
              onClick={() => setCropEdit(!cropEdit)}
              aria-expanded={cropEdit}
              className="min-h-11 rounded-[10px] border border-rule-strong bg-paper px-3.5 text-sm font-semibold text-primary"
            >
              {cropEdit ? "Zamknij" : "Zmień"}
            </button>
          </div>
          {cropEdit && (
            <div className="flex flex-col gap-2.5 border-t border-primary-border bg-paper p-3.5">
              <span className="text-[13px] text-ink-3">
                Wybierz, jeśli w tym roku rośnie tu coś innego. Od uprawy zależą progi suszy i odczyt zdjęć.
              </span>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2">
                {CROPS.map((c) => {
                  const sel = (crop ?? parcel.detectedCrop) === c.id;
                  return (
                    <button
                      key={c.id}
                      aria-pressed={sel}
                      onClick={() => {
                        onCrop(c.id === parcel.detectedCrop ? null : c.id);
                        setCropEdit(false);
                      }}
                      className={`flex min-h-16 flex-col justify-center gap-0.5 rounded-xl px-3 py-2.5 text-left text-ink ${sel ? "border-2 border-primary bg-primary-tint" : "border border-rule-strong bg-paper"}`}
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

function ParcelShape() {
  return (
    <svg width="96" height="76" viewBox="0 0 96 76" role="img" aria-label="Kształt znalezionej działki" style={{ flex: "none" }}>
      <rect width="96" height="76" rx="8" fill="#DDE8DA" />
      <path d="M0 30 L96 22 M30 0 L36 76 M70 0 L62 76" stroke="#C6D6C2" strokeWidth="1.5" />
      <polygon points="14,18 58,10 84,16 80,64 40,70 16,60" fill="#FFFFFF" fillOpacity="0.55" stroke="#1E5B3A" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Demo map with three neighbouring parcels (stand-in for the ULDK GetParcelByXY click). */
function PickMap({ selected, onPick }: { selected: string | null; onPick: (x: number) => void }) {
  const parcels = [
    { nr: "118", x: 0.15, pts: "4,20 96,10 104,150 8,160" },
    { nr: "245/3", x: 0.5, pts: "104,10 230,4 236,140 104,150" },
    { nr: "119/2", x: 0.9, pts: "236,4 296,8 296,136 236,140" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <svg viewBox="0 0 300 170" className="w-full rounded-[14px] bg-[#DDE7D5]" role="group" aria-label="Mapa: kliknij swoją działkę">
        <path d="M0 165 L300 158" stroke="#D8D2C2" strokeWidth="7" />
        {parcels.map((p) => {
          const sel = selected === p.nr;
          return (
            <g key={p.nr} role="button" tabIndex={0} aria-label={`Działka ${p.nr}`} onClick={() => onPick(p.x)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(p.x)} className="cursor-pointer">
              <polygon points={p.pts} fill={sel ? "#EEF5EF" : "#CFE3B9"} fillOpacity={sel ? 0.9 : 0.7} stroke={sel ? "#1E5B3A" : "#8FA982"} strokeWidth={sel ? 3 : 1.5} strokeLinejoin="round" />
              <text x={p.pts.split(" ").map((s) => +s.split(",")[0]).reduce((a, b) => a + b) / 4} y="82" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1A1C19">
                {p.nr}
              </text>
            </g>
          );
        })}
      </svg>
      <span className="text-[13px] text-muted">Podgląd: mapa przykładowa. Docelowo ortofotomapa z granicami działek (Geoportal).</span>
    </div>
  );
}
