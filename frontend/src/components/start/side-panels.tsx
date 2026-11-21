"use client";

import Link from "next/link";
import type { FarmParcel } from "@/lib/farm";
import type { AnalysisStep, StatusTone } from "@/lib/types";
import { Card, ICON, Icon } from "../ui";

const FARM_PILL: Record<StatusTone, string> = {
  susza: "bg-danger-tint text-danger-ink",
  zagrozenie: "bg-amber-tint text-amber-ink",
  plan: "bg-amber-tint text-amber-ink",
  spokojnie: "bg-ok-tint text-ok-ink",
  "poza-zakresem": "bg-chip text-ink-2",
};

export function FarmPanel({
  farm,
  onAdd,
  onRemove,
  canAdd,
}: {
  farm: FarmParcel[];
  onAdd: () => void;
  onRemove: (parcelId: string) => void;
  canAdd: boolean;
}) {
  return (
    <Card className="flex flex-col gap-3 p-6 max-sm:p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-[17px] font-bold">Twoje gospodarstwo</h2>
        <span className="text-xs text-muted">zapisane tylko w tej przeglądarce</span>
      </div>
      {farm.length === 0 && (
        <p className="rounded-xl border border-dashed border-rule-strong p-3 text-sm text-ink-3">
          Sprawdzone działki pojawią się tutaj. Możesz też dodać działkę bez sprawdzania.
        </p>
      )}
      {farm.length > 0 && (
        <ul className="flex flex-col gap-2">
          {farm.map((f) => (
            <li key={f.parcelId} className="flex items-stretch rounded-xl border border-rule-soft hover:border-rule-strong">
              <Link
                href={f.url}
                prefetch={false}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-3 p-3 text-ink no-underline"
              >
                <span className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${f.tone ? FARM_PILL[f.tone] : "bg-chip text-ink-2"}`}>
                  {f.status}
                </span>
                <span className="flex min-w-[140px] flex-1 flex-col">
                  <span className="text-sm font-bold">{f.name}</span>
                  <span className="text-xs text-muted">{f.meta}</span>
                </span>
                <Icon d={ICON.chevronRight} stroke={2.4} className="text-muted" />
              </Link>
              <button
                onClick={() => onRemove(f.parcelId)}
                aria-label={`Usuń działkę ${f.name} z listy`}
                className="flex w-11 flex-none items-center justify-center border-l border-rule-soft text-muted hover:text-ink"
              >
                <Icon d={ICON.x} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={onAdd}
        disabled={!canAdd}
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-[10px] border border-rule-strong bg-paper px-3.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon d={ICON.plus} /> Dodaj wskazaną działkę
      </button>
    </Card>
  );
}

export interface ProgressState {
  elapsed: number;
  progress: number;
  steps: AnalysisStep[];
  done: boolean;
}

export function ProgressPanel({ status, error }: { status: ProgressState | null; error: string | null }) {
  const failed = status?.steps.filter((s) => s.state === "failed").length ?? 0;
  return (
    <Card className="flex flex-col gap-4 p-6 max-sm:p-4">
      <div className="flex items-center gap-2.5">
        <h2 className="text-[17px] font-bold">{status?.done ? "Analiza gotowa" : "Trwa analiza działki"}</h2>
        {status && (
          <span className="tabular ml-auto text-sm font-bold text-primary">
            {status.elapsed.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-warn-bg px-3 py-2.5 text-sm text-warn-ink">
          {error}
        </p>
      )}
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
          <ol className="flex flex-col gap-0.5">
            {status.steps.map((s) => (
              <li key={s.label} className="flex items-start gap-3 border-b border-chip py-2">
                <StepIcon state={s.state} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{s.label}</span>
                  <span className="text-xs text-muted">{s.src}</span>
                  {s.error && <span className="text-xs font-semibold text-amber-ink">{s.error}</span>}
                </div>
                <span className="tabular whitespace-nowrap text-[13px] text-muted">
                  {s.state === "done" || s.state === "failed"
                    ? `${s.seconds?.toLocaleString("pl-PL")} s`
                    : s.state === "running"
                      ? "trwa…"
                      : "—"}
                </span>
              </li>
            ))}
          </ol>
          <p className="sr-only" aria-live="polite">
            {status.done ? "Analiza gotowa, otwieram raport." : `Postęp ${status.progress} procent.`}
          </p>
        </>
      )}
      {failed > 0 && (
        <p className="rounded-[10px] bg-bg p-3 text-[13px] text-ink-3">
          {failed === 1 ? "Jedno źródło nie dało" : `${failed} źródła nie dały`} wyniku — analiza i tak się kończy, a raport powie wprost,
          czego zabrakło.
        </p>
      )}
    </Card>
  );
}

function StepIcon({ state }: { state: AnalysisStep["state"] }) {
  if (state === "done")
    return (
      <span className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-primary-tint-2 text-primary">
        <Icon d={ICON.check} size={13} stroke={3} />
      </span>
    );
  if (state === "failed")
    return (
      <span className="inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-amber-tint text-amber-ink" aria-label="brak wyniku">
        <Icon d="M12 7v6M12 16.5v.5" size={13} stroke={3} />
      </span>
    );
  if (state === "running")
    return <span className="spinner box-border h-[22px] w-[22px] flex-none rounded-full border-[3px] border-primary-border border-t-primary" />;
  return <span className="box-border h-[22px] w-[22px] flex-none rounded-full border-2 border-dashed border-rule-strong" />;
}
