"use client";

import Link from "next/link";
import type { FarmParcel, FarmTone } from "@/lib/farm";
import type { AnalysisStatus } from "@/lib/types";
import { Card, ICON, Icon } from "../ui";

const FARM_PILL: Record<FarmTone, string> = {
  danger: "bg-[#FBE3E3] text-[#8E1F1F]",
  warn: "bg-[#FDF1DC] text-[#6A4300]",
  ok: "bg-[#E3F3E3] text-[#145C14]",
};

export function FarmPanel({ farm, onAdd, canAdd }: { farm: FarmParcel[]; onAdd: () => void; canAdd: boolean }) {
  return (
    <Card className="flex flex-col gap-3 p-6 max-sm:p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[17px] font-bold">Twoje gospodarstwo</h2>
        <span className="text-xs text-muted">zapisane tylko w tej przeglądarce</span>
      </div>
      {farm.length === 0 && <p className="text-sm text-muted">Nie masz jeszcze zapisanych działek.</p>}
      {farm.map((f) => (
        <Link
          key={f.parcelId}
          href={f.url}
          prefetch={false}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-rule-soft p-3 text-ink no-underline hover:border-rule-strong"
        >
          <span className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${FARM_PILL[f.tone]}`}>{f.status}</span>
          <span className="flex min-w-[140px] flex-1 flex-col">
            <span className="text-sm font-bold">{f.name}</span>
            <span className="text-xs text-muted">{f.meta}</span>
          </span>
          <Icon d={ICON.chevronRight} stroke={2.4} className="text-[#6B6E66]" />
        </Link>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          disabled
          title="Wkrótce"
          className="min-h-11 rounded-[10px] border border-primary bg-primary px-3.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          Sprawdź wszystkie ({farm.length})
        </button>
        <button
          onClick={onAdd}
          disabled={!canAdd}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-rule-strong bg-paper px-3.5 text-sm font-semibold text-ink disabled:opacity-50"
        >
          <Icon d={ICON.plus} /> Dodaj działkę
        </button>
      </div>
      <span className="text-xs leading-snug text-muted">
        Zastawki, oczka i pasy mogą obejmować kilka działek — w widoku gospodarstwa pokażemy wspólne miejsca retencji.
      </span>
    </Card>
  );
}

export function ProgressPanel({ status, error }: { status: AnalysisStatus | null; error: string | null }) {
  return (
    <Card className="flex flex-col gap-4 p-6 max-sm:p-4">
      <div className="flex items-center gap-2.5">
        <h2 className="text-[17px] font-bold">{status?.done ? "Analiza gotowa" : status ? "Trwa analiza działki" : "Analiza działki"}</h2>
        {status && (
          <span className="tabular ml-auto text-sm font-bold text-primary">
            {status.elapsed.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s
          </span>
        )}
      </div>
      {!status && !error && (
        <p className="text-sm text-ink-3">
          Po kliknięciu „Sprawdź działkę” pobierzemy równolegle granice, uprawy, pogodę z 10 lat, glebę, teren i zdjęcia
          satelitarne. Zwykle trwa to poniżej 30 sekund.
        </p>
      )}
      {error && <p className="rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn-ink">{error}</p>}
      {status && (
        <>
          <div
            className="h-2 overflow-hidden rounded bg-rule-soft"
            role="progressbar"
            aria-valuenow={status.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Postęp analizy"
          >
            <div className="h-2 rounded bg-primary transition-[width] duration-300" style={{ width: `${status.progress}%` }} />
          </div>
          <ol className="flex flex-col gap-0.5" aria-live="polite">
            {status.steps.map((s) => (
              <li key={s.label} className="flex items-start gap-3 border-b border-chip py-2">
                {s.state === "done" && (
                  <span className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-primary-tint-2 text-primary">
                    <Icon d={ICON.check} size={13} stroke={3} />
                  </span>
                )}
                {s.state === "running" && (
                  <span className="spinner box-border h-[22px] w-[22px] flex-none rounded-full border-[3px] border-primary-border border-t-primary" />
                )}
                {s.state === "wait" && (
                  <span className="box-border h-[22px] w-[22px] flex-none rounded-full border-2 border-dashed border-[#C3C2B7]" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="text-xs text-muted">{s.src}</span>
                </div>
                <span className="tabular whitespace-nowrap text-[13px] text-muted">
                  {s.state === "done" ? `${s.seconds?.toLocaleString("pl-PL")} s` : s.state === "running" ? "trwa…" : "—"}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="rounded-[10px] bg-bg p-3 text-[13px] text-ink-3">
        Jeśli któreś źródło nie odpowie, analiza i tak się zakończy — raport powie wprost, czego zabrakło.
      </p>
    </Card>
  );
}
