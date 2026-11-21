"use client";

import { historyWindow, isValidIso, MIN_DATE, shortDate } from "@/lib/dates";

export function DatePicker({ value, today, onChange }: { value: string; today: string; onChange: (iso: string) => void }) {
  const y = Number(today.slice(0, 4));
  // Mid-July of the latest season that already happened.
  const july = `${today.slice(5) >= "07-15" ? y : y - 1}-07-15`;
  const presets = [
    { iso: today, label: `Dziś · ${shortDate(today)}` },
    { iso: july, label: shortDate(july) },
    { iso: "2018-07-15", label: "Susza 2018 · 15.07.2018" },
    { iso: MIN_DATE, label: `Najstarsza · ${shortDate(MIN_DATE)}` },
  ];
  const win = historyWindow(value);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => {
          const sel = p.iso === value;
          return (
            <button
              key={p.label}
              aria-pressed={sel}
              onClick={() => onChange(p.iso)}
              className={`min-h-11 rounded-xl px-3.5 text-sm text-ink ${sel ? "border-2 border-primary bg-primary-tint font-bold" : "border border-rule-strong bg-paper font-medium"}`}
            >
              {p.label}
            </button>
          );
        })}
        <label htmlFor="dzien" className="sr-only">
          Data analizy
        </label>
        <input
          id="dzien"
          type="date"
          min={MIN_DATE}
          max={today}
          value={value}
          onChange={(e) => isValidIso(e.target.value) && e.target.value >= MIN_DATE && e.target.value <= today && onChange(e.target.value)}
          className="min-h-11 rounded-xl border border-rule-strong bg-paper px-3.5 text-[15px] text-ink"
        />
      </div>
      <span className="text-sm text-ink-2">
        Porównamy z 10 latami:{" "}
        <b>
          {win.from} – {win.to}
        </b>
        . Liczymy tylko z danych dostępnych do tego dnia.
      </span>
      {win.hasOldImagery && (
        <span className="rounded-lg bg-warn-bg px-3 py-2.5 text-[13px] leading-snug text-warn-ink">
          Dla lat przed 2017 zdjęcia satelitarne są mniej szczegółowe (Landsat 30 m), a prognozy z tamtego dnia nie da się
          odtworzyć — raport powie, jak to wpływa na pewność.
        </span>
      )}
      <details className="text-[13px] text-ink-2">
        <summary className="min-h-7 font-semibold text-primary">Skąd dane dla tych lat?</summary>
        <div className="flex flex-col gap-2 pt-2">
          <div className="grid grid-cols-10 gap-1">
            {win.years.map((yr) => (
              <div key={yr.year} className="flex flex-col gap-1">
                <span
                  title={yr.tip}
                  className="block h-2.5 rounded-[3px]"
                  style={{ background: yr.sensor === "s2" ? "#1E5B3A" : yr.sensor === "mixed" ? "#6da7ec" : "#3987e5" }}
                />
                <span className="tabular text-center text-[11px] max-sm:text-[9px]">{yr.year}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3.5 rounded-sm bg-primary" />
              zdjęcia Sentinel-2 · 10 m
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3.5 rounded-sm bg-[#3987e5]" />
              zdjęcia Landsat · 30 m
            </span>
            <span>pogoda i bilans wody: wszystkie lata (ERA5-Land) · uprawy: deklaracje ARiMR, mapa upraw Copernicus</span>
          </div>
        </div>
      </details>
    </div>
  );
}
