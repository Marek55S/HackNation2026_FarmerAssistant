"use client";

// Uprawy na wybranej działce ewidencyjnej. Działka niesie glebę, teren i zlewnię (stąd retencja liczy się
// dla całej działki), a uprawa decyduje o bilansie wody — dlatego każdej części przypisujemy uprawę osobno.
// Podział przychodzi z deklaracji ARiMR przyciętych do granic działki (2025–2026) albo z mapy upraw
// Copernicus (2017–2024); czego źródła nie znają, wskazuje rolnik.

import { useMemo, useState } from "react";
import { CROPS } from "@/lib/crops";
import type { CropId, ParcelPart, PartChoice } from "@/lib/types";
import { ICON, Icon } from "../ui";

const selectCls =
  "min-h-11 rounded-[10px] border border-rule-strong bg-paper px-3 text-sm font-semibold text-ink focus:border-primary focus:outline-none";

const ha = (v: number) => v.toLocaleString("pl-PL", { maximumFractionDigits: 2 });

/** Efektywny podział: wykryte części z nadpisaniami rolnika plus części dodane ręcznie. */
export function effectiveParts(parts: ParcelPart[], choices: Record<string, CropId | null>, added: PartChoice[]): PartChoice[] {
  return [
    ...parts.map((p) => ({ id: p.id, crop: p.id in choices ? choices[p.id] : p.crop, areaHa: p.areaHa })),
    ...added.filter((a) => a.crop),
  ];
}

export function CropParts({
  parts,
  areaHa,
  choices,
  added,
  onChoice,
  onAdded,
}: {
  parts: ParcelPart[];
  areaHa: number;
  choices: Record<string, CropId | null>;
  added: PartChoice[];
  onChoice: (id: string, crop: CropId | null) => void;
  onAdded: (next: PartChoice[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ crop: CropId | ""; ha: string }>({ crop: "", ha: "" });

  const efektywne = useMemo(() => effectiveParts(parts, choices, added), [parts, choices, added]);
  const zUprawa = efektywne.filter((p) => p.crop).length;
  const bezUprawy = parts.filter((p) => !(p.id in choices ? choices[p.id] : p.crop));
  const brakHa = bezUprawy.reduce((s, p) => s + p.areaHa, 0);
  const wolne = Math.max(0, areaHa - efektywne.reduce((s, p) => s + (p.areaHa ?? 0), 0));
  const zrodlo = parts[0]?.source ?? "";

  function dodaj() {
    const v = Number(draft.ha.replace(",", "."));
    if (!draft.crop) return;
    onAdded([...added, { crop: draft.crop, ...(v > 0 ? { areaHa: Math.min(v, areaHa) } : {}) }]);
    setDraft({ crop: "", ha: "" });
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-primary-border bg-paper p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-[15px] font-bold">
          Co rośnie na działce{parts.length > 1 ? ` · ${parts.length} części` : ""}
        </h3>
        <span className="text-xs text-muted">Od uprawy zależą progi suszy, odczyt zdjęć i dawki podlewania.</span>
      </div>

      <ul className="flex flex-col gap-2">
        {parts.map((p) => {
          const crop = p.id in choices ? choices[p.id] : p.crop;
          const zmienione = p.id in choices && choices[p.id] !== p.crop;
          return (
            <li
              key={p.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-2.5 ${
                crop ? "border-rule-soft bg-chip/40" : "border-warn-ink/30 bg-warn-bg"
              }`}
            >
              <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brown-tint text-brown">
                <Icon d={crop ? ICON.sprout : ICON.info} size={18} stroke={2.2} />
              </span>
              <div className="flex min-w-[150px] flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-ink">
                  {ha(p.areaHa)} ha
                  <span className="font-normal text-muted"> · {Math.round(100 * p.share)}% działki</span>
                </span>
                <span className="text-xs text-muted">{zmienione ? `zmienione przez Ciebie (źródło: ${p.source})` : p.source}</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted">
                <span className="sr-only">Uprawa dla części {ha(p.areaHa)} ha</span>
                <select
                  value={crop ?? ""}
                  onChange={(e) => onChoice(p.id, (e.target.value || null) as CropId | null)}
                  className={selectCls}
                >
                  <option value="">Wskaż uprawę…</option>
                  {CROPS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          );
        })}

        {added.map((a, i) => (
          <li key={`r${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-rule-soft bg-chip/40 p-2.5">
            <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brown-tint text-brown">
              <Icon d={ICON.sprout} size={18} stroke={2.2} />
            </span>
            <div className="flex min-w-[150px] flex-1 flex-col gap-0.5">
              <span className="text-sm font-semibold text-ink">
                {CROPS.find((c) => c.id === a.crop)?.name}
                {a.areaHa ? <span className="font-normal text-muted"> · {ha(a.areaHa)} ha</span> : null}
              </span>
              <span className="text-xs text-muted">dodane przez Ciebie</span>
            </div>
            <button
              type="button"
              onClick={() => onAdded(added.filter((_, k) => k !== i))}
              className="min-h-11 rounded-[10px] border border-rule-strong bg-paper px-3 text-sm font-semibold text-ink-2 hover:text-ink"
            >
              Usuń
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-rule-strong p-2.5">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
            Uprawa
            <select value={draft.crop} onChange={(e) => setDraft({ ...draft, crop: e.target.value as CropId | "" })} className={selectCls}>
              <option value="">Wybierz…</option>
              {CROPS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
            Powierzchnia (ha)
            <input
              value={draft.ha}
              onChange={(e) => setDraft({ ...draft, ha: e.target.value })}
              inputMode="decimal"
              placeholder={wolne > 0.01 ? ha(wolne) : ha(areaHa)}
              className={`${selectCls} w-28`}
            />
          </label>
          <button
            type="button"
            onClick={dodaj}
            disabled={!draft.crop}
            className="min-h-11 rounded-[10px] bg-btn px-4 text-sm font-bold text-btn-ink disabled:opacity-50"
          >
            Dodaj
          </button>
          <button type="button" onClick={() => setAdding(false)} className="min-h-11 px-2 text-sm font-semibold text-ink-3 hover:text-ink">
            Anuluj
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-[10px] border border-rule-strong bg-paper px-3.5 text-sm font-semibold text-primary"
        >
          <Icon d={ICON.plus} size={16} stroke={2.5} />
          Dodaj uprawę, której tu nie ma
        </button>
      )}

      <p aria-live="polite" className="text-[13px] text-muted">
        {zUprawa === 0
          ? "Wskaż uprawę albo wybierz „Brak uprawy”, żeby zacząć (dostaniesz retencję i teren)."
          : efektywne.some((p) => p.crop === "brak") && !efektywne.some((p) => p.crop && p.crop !== "brak")
            ? "Przyjęto brak uprawy — raport pokaże glebę, teren i retencję. Możesz wskazać uprawę, jeśli ją znasz."
          : brakHa > 0.01
            ? `${ha(brakHa)} ha bez wskazanej uprawy — ta część nie dostanie zaleceń polowych ani podlewania. Retencja liczy się dla całej działki.`
            : zrodlo.startsWith("mapa upraw")
              ? "Podział z mapy upraw Copernicus — sprawdź go, bo jest mniej dokładny niż deklaracje ARiMR."
              : "Możesz zmienić każdą uprawę, jeśli źródło się myli."}
      </p>
    </div>
  );
}
