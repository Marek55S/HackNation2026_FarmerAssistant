"use client";

import Link from "next/link";
import { checkedAgo, recheckUrl, reportDate, type FarmParcel } from "@/lib/farm";
import { shortDate, todayIso } from "@/lib/dates";
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
          {farm.map((f) => {
            const d = f.date ?? reportDate(f.url);
            const today = todayIso();
            // A checked parcel whose result is not for today: one click recomputes it for today.
            const stale = !!f.tone && !!d && d !== today;
            const when = [d && f.tone ? `stan na ${shortDate(d)}` : null, f.checkedAt ? checkedAgo(f.checkedAt) : null].filter(Boolean).join(" · ");
            return (
              <li key={f.parcelId} className="flex flex-col overflow-hidden rounded-xl border border-rule-soft hover:border-rule-strong">
                <div className="flex items-stretch">
                  <Link href={f.url} prefetch={false} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-ink no-underline">
                    <ParcelThumb shape={f.shape} tone={f.tone} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-bold">{f.name}</span>
                        <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold ${f.tone ? FARM_PILL[f.tone] : "bg-chip text-ink-2"}`}>
                          {f.status}
                        </span>
                      </span>
                      <span className="text-xs text-ink-3">{f.meta}</span>
                      {when && <span className="text-[11px] text-muted">{when}</span>}
                    </span>
                    <Icon d={ICON.chevronRight} stroke={2.4} className="flex-none text-muted" />
                  </Link>
                  <button
                    onClick={() => onRemove(f.parcelId)}
                    aria-label={`Usuń działkę ${f.name} z listy`}
                    className="flex w-11 flex-none items-center justify-center border-l border-rule-soft text-muted hover:text-ink"
                  >
                    <Icon d={ICON.x} />
                  </button>
                </div>
                {stale && (
                  <Link
                    href={recheckUrl(f.url, today)}
                    prefetch={false}
                    className="flex min-h-10 items-center gap-1.5 border-t border-rule-soft px-3 text-[13px] font-semibold text-heading no-underline hover:bg-primary-tint"
                  >
                    <Icon d={ICON.calendar} size={15} stroke={2} />
                    Sprawdź na dziś ({shortDate(today)})
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button
        onClick={onAdd}
        disabled={!canAdd}
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-[var(--r-btn)] border border-rule-strong bg-paper px-3.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon d={ICON.plus} /> Dodaj wskazaną działkę
      </button>
    </Card>
  );
}

/** What each analysis step is about, in the farmer's words, with its pictogram (matched by the step label). */
const STORY: { match: RegExp; icon: string; say: string }[] = [
  { match: /^Granice/, icon: ICON.fields, say: "Szukam granic działki i upraw" },
  { match: /^Prognoza/, icon: ICON.calendar, say: "Sprawdzam prognozę na najbliższe dni" },
  { match: /po tamtym dniu/, icon: ICON.calendar, say: "Uzupełniam pogodę po tamtym dniu" },
  { match: /^Pogoda/, icon: ICON.rain, say: "Zbieram pogodę z 30 lat" },
  { match: /^Gleba/, icon: ICON.sand, say: "Sprawdzam, jaka jest gleba" },
  { match: /^Rzeźba/, icon: ICON.slope, say: "Czytam ukształtowanie terenu" },
  { match: /^Rowy/, icon: ICON.ditch, say: "Szukam rowów i zbiorników w okolicy" },
  { match: /satelit/i, icon: ICON.satellite, say: "Przeglądam zdjęcia satelitarne z 10 lat" },
  { match: /suszy w Europie/, icon: ICON.sun, say: "Porównuję z suszą w Europie" },
  { match: /^Bilans/, icon: ICON.drop, say: "Liczę bilans wody i progi suszy" },
  { match: /^Przyczyny/, icon: ICON.sprout, say: "Układam zalecenia dla działki" },
];
const storyOf = (label: string) => STORY.find((s) => s.match.test(label)) ?? { icon: ICON.check, say: label };

const TONE_STROKE: Record<StatusTone, string> = {
  susza: "var(--status-susza)",
  zagrozenie: "var(--status-zagrozenie)",
  spokojnie: "var(--status-spokojnie)",
  plan: "var(--status-plan)",
  "poza-zakresem": "var(--status-poza)",
};

/** The parcel's own outline as a small thumbnail, drawn in the colour of its last status. */
function ParcelThumb({ shape, tone }: { shape?: [number, number][]; tone: StatusTone | null }) {
  const box = "inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-chip";
  if (!shape || shape.length < 3) {
    return (
      <span className={`${box} text-muted`} aria-hidden="true">
        <Icon d={ICON.fields} size={20} stroke={1.7} />
      </span>
    );
  }
  // Longitude shrinks with latitude: scale x so the shape is not stretched.
  const k = Math.cos((shape[0][1] * Math.PI) / 180);
  const xs = shape.map((p) => p[0] * k);
  const ys = shape.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(x1 - x0, y1 - y0) || 1;
  const S = 32;
  const pts = shape
    .map((p, i) => `${(((xs[i] - x0) / span) * S + (S - ((x1 - x0) / span) * S) / 2 + 6).toFixed(1)},${(((y1 - p[1]) / span) * S + (S - ((y1 - y0) / span) * S) / 2 + 6).toFixed(1)}`)
    .join(" ");
  const stroke = tone ? TONE_STROKE[tone] : "var(--muted)";
  return (
    <span className={box} aria-hidden="true">
      <svg viewBox="0 0 44 44" width={44} height={44}>
        <polygon points={pts} fill={stroke} fillOpacity={0.14} stroke={stroke} strokeWidth={1.8} strokeLinejoin="round" />
      </svg>
    </span>
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
        {status && status.elapsed > 0 && (
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
          {/* What is happening right now, in plain words — the long wait becomes a short story. */}
          {(() => {
            const now = status.steps.find((s) => s.state === "running");
            const story = status.done ? { icon: ICON.check, say: "Gotowe — otwieram raport" } : now ? storyOf(now.label) : null;
            if (!story) return null;
            return (
              <div className="flex items-center gap-3.5">
                <span className={`inline-flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-primary-tint text-heading ${status.done ? "" : "story-pulse"}`}>
                  <Icon d={story.icon} size={26} stroke={1.7} />
                </span>
                <span key={story.say} className="story-line flex min-w-0 flex-col">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{status.done ? "Koniec" : "Teraz"}</span>
                  <span className="text-[16px] font-semibold leading-snug text-heading">{story.say}…</span>
                  {now && !status.done && <span className="truncate text-xs text-muted">{now.src}</span>}
                </span>
              </div>
            );
          })()}
          {/* The whole pipeline at a glance: one pictogram per source. */}
          <ol className="flex flex-wrap gap-1.5" aria-label="Kroki analizy">
            {status.steps.map((s) => (
              <li
                key={s.label}
                title={s.label}
                className={`pipe-step inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                  s.state === "done"
                    ? "bg-primary text-on-primary"
                    : s.state === "running"
                      ? "bg-primary-tint text-heading ring-2 ring-primary"
                      : s.state === "failed"
                        ? "bg-amber-tint text-amber-ink"
                        : "bg-chip text-muted"
                }`}
              >
                <Icon d={storyOf(s.label).icon} size={18} stroke={1.8} />
                <span className="sr-only">
                  {s.label}: {s.state === "done" ? "gotowe" : s.state === "running" ? "trwa" : s.state === "failed" ? "brak wyniku" : "czeka"}
                </span>
              </li>
            ))}
          </ol>
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
          <details className="group text-sm">
            <summary className="flex min-h-8 list-none items-center gap-1.5 font-semibold text-heading [&::-webkit-details-marker]:hidden">
              <Icon d={ICON.chevronRight} size={15} className="transition-transform duration-200 group-open:rotate-90" />
              Szczegóły: źródła i czasy
            </summary>
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
          </details>
          <p className="sr-only" aria-live="polite">
            {status.done ? "Analiza gotowa, otwieram raport." : `Postęp ${status.progress} procent.`}
          </p>
        </>
      )}
      {failed > 0 && (
        <p className="rounded-[var(--r-btn)] bg-bg p-3 text-[13px] text-ink-3">
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
