"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Action, ActionId, MapLayer, Report } from "@/lib/types";
import { MobileNav } from "../mobile-nav";
import { Card, ICON, Icon, Logo, StatusPill, Tank } from "../ui";
import { CAT, LAYERS, LEGEND, ParcelMap } from "./parcel-map";
import { ActionList, Causes, Risk, Sources } from "./sections";

const URGENT_TONE = {
  ret: { border: "#1E5B3A", bg: "#EEF5EF", label: "#1E5B3A" },
  agro: { border: "#7A4E14", bg: "#F7EFE3", label: "#7A4E14" },
  irr: { border: "#1f6fc9", bg: "#E9F1FC", label: "#134a8a" },
};

export function ReportScreen({ report, url }: { report: Report; url: string }) {
  const urgentAction = report.actions.find((a) => a.id === report.urgent.actionId)!;
  const [pin, setPin] = useState<ActionId>(urgentAction.id);
  const [layer, setLayer] = useState<MapLayer>("plan");
  const [askOpen, setAskOpen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  const select = (a: Action, scroll = false) => {
    setPin(a.id);
    setLayer(a.layer);
    if (scroll) mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const showLayer = (l: MapLayer) => {
    setLayer(l);
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const tone = URGENT_TONE[urgentAction.cat];
  const p = report.parcel;
  const startHref = `/?dzialka=${encodeURIComponent(p.id)}`;

  return (
    <div className="min-h-screen bg-bg pb-24 text-ink md:pb-0 print:pb-0">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-[1376px] flex-wrap items-center gap-3.5 px-8 py-3 max-sm:gap-2 max-sm:px-4">
          <Link href="/" className="no-print flex items-center gap-2.5 text-ink no-underline max-sm:hidden">
            <Logo size={32} />
            <span className="text-base font-extrabold">Asystent Wodny</span>
          </Link>
          <Link href={startHref} aria-label="Wróć do wyboru działki" className="no-print -ml-1 p-1 text-ink sm:hidden">
            <Icon d={ICON.chevronLeft} size={22} stroke={2.4} />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col border-rule sm:flex-none sm:border-l sm:pl-3.5">
            <span className="text-[17px] font-extrabold">
              Działka {p.number} · {report.crop.name.toLowerCase()}{" "}
              <span className="text-xs font-semibold text-muted max-sm:hidden">
                ({report.cropDetected ? "wykryta: ARiMR + satelita" : "wybrana przez Ciebie"})
              </span>
            </span>
            <span className="text-[13px] text-muted max-sm:text-xs">
              stan na {report.dateLong} · <span className="max-sm:hidden">porównanie z 10 sezonami </span>
              {report.yearsLabel} · {p.areaHa.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} ha
            </span>
          </div>
          <div className="sm:hidden">
            <StatusPill tone={report.status.tone} label={report.status.label} small />
          </div>
          <nav className="no-print ml-auto flex flex-wrap gap-2 max-sm:hidden">
            <button
              onClick={() => setAskOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-rule-strong bg-paper px-3.5 text-sm font-semibold text-ink"
            >
              <Icon d={ICON.chat} />
              Zapytaj
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-rule-strong bg-paper px-3.5 text-sm font-semibold text-ink"
            >
              <Icon d={ICON.print} />
              Drukuj
            </button>
            <button
              onClick={() => window.print()}
              title="Zapisz jako PDF w oknie drukowania"
              className="inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-3.5 text-sm font-semibold text-white"
            >
              <Icon d={ICON.download} />
              PDF
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1376px] flex-col gap-5 px-8 pb-14 pt-6 max-sm:gap-4 max-sm:px-4 max-sm:pt-4">
        {/* Status bar: one sentence + soil water tank + the single most important action */}
        <Card className="print-break-avoid flex flex-wrap items-center gap-5 rounded-[20px] px-6 py-5 max-sm:gap-4 max-sm:p-4">
          <div className="flex min-w-0 flex-[999_1_520px] items-center gap-4">
            <Tank
              pct={report.soilWaterPct}
              threshold={report.stressThresholdPct}
              label={`Woda w glebie: ${report.soilWaterPct} procent, próg stresu ${report.stressThresholdPct} procent`}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="max-sm:hidden">
                  <StatusPill tone={report.status.tone} label={report.status.label} />
                </span>
                <span className="text-2xl font-extrabold leading-tight tracking-tight max-sm:text-xl">{report.headline}</span>
              </div>
              <span className="text-sm leading-snug text-ink-2">{report.summary}</span>
              <span
                className="inline-flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2"
                title="Niezależne wskaźniki: opady, gleba, rośliny, próg IUNG"
              >
                pewność
                <span className="inline-flex gap-[3px]">
                  {Array.from({ length: report.confidence.total }, (_, i) => (
                    <span key={i} className={`h-2 w-2 rounded-full ${i < report.confidence.agreeing ? "bg-primary" : "bg-rule-strong"}`} />
                  ))}
                </span>
                <b>{report.confidence.level}</b> · {report.confidence.agreeing} z {report.confidence.total} wskaźników zgodne
              </span>
            </div>
          </div>
          <button
            onClick={() => select(urgentAction, true)}
            className="flex min-h-[72px] flex-[1_1_320px] items-center gap-3.5 rounded-[14px] border-2 px-4 py-3 text-left text-ink"
            style={{ borderColor: tone.border, background: tone.bg }}
          >
            <span
              className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-base font-extrabold text-white"
              style={{ background: CAT[urgentAction.cat].color }}
            >
              {urgentAction.n}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-bold tracking-[0.05em]" style={{ color: tone.label }}>
                {report.urgent.label}
              </span>
              <span className="text-base font-extrabold">{report.urgent.title}</span>
              <span className="text-[13px] text-ink-2">{report.urgent.sub}</span>
            </span>
          </button>
        </Card>

        {/* Map with layers + action list */}
        <section className="flex flex-wrap items-start gap-5">
          <div
            ref={mapRef}
            id="mapa"
            className="print-break-avoid flex min-w-0 flex-[999_1_640px] scroll-mt-4 flex-col gap-3.5 rounded-[20px] border border-rule bg-paper p-[18px] max-sm:p-3"
          >
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-extrabold">Plan na Twojej działce</h1>
              <div role="tablist" aria-label="Widok mapy" className="no-print ml-auto flex flex-wrap gap-1 rounded-xl bg-chip p-1 max-sm:ml-0 max-sm:w-full">
                {(Object.keys(LAYERS) as MapLayer[]).map((k) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={layer === k}
                    onClick={() => setLayer(k)}
                    className={`min-h-10 rounded-[9px] px-3 text-[13px] max-sm:flex-1 max-sm:px-1.5 max-sm:text-xs ${layer === k ? "bg-paper font-bold text-ink shadow-sm" : "font-medium text-ink-2"}`}
                  >
                    {LAYERS[k]}
                  </button>
                ))}
              </div>
            </div>
            <ParcelMap actions={report.actions} layer={layer} pin={pin} onPin={(a) => select(a)} />
            <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2.5">
              {LEGEND[layer].map((l) => (
                <span key={l.t} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                  <span style={l.style} />
                  {l.t}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-0.5 rounded-xl bg-bg px-3.5 py-3">
              <span className="text-[15px] font-bold">{report.mapInfo[layer].say}</span>
              <span className="text-xs text-muted">{report.mapInfo[layer].src}</span>
            </div>
          </div>
          <aside className="flex min-w-0 flex-[1_1_380px] flex-col">
            <ActionList actions={report.actions} pin={pin} onPick={(a) => select(a, window.matchMedia("(max-width: 1100px)").matches)} />
          </aside>
        </section>

        <section className="flex flex-wrap items-stretch gap-5 max-sm:gap-4">
          <Causes report={report} onShow={showLayer} />
          <Risk report={report} />
        </section>

        <Sources report={report} />

        <p className="text-center text-xs text-muted">
          Prototyp — dane przykładowe. <span className="print-only">Raport: {url}</span>
        </p>
      </main>

      {askOpen && <AskDialog onClose={() => setAskOpen(false)} />}
      <MobileNav active="raport" reportHref={url} onAsk={() => setAskOpen(true)} />
    </div>
  );
}

/** Placeholder for the optional LLM assistant (answers only from report data). */
function AskDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-title"
      className="no-print fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div className="flex w-full max-w-md flex-col gap-3 rounded-[18px] bg-paper p-5" onClick={(e) => e.stopPropagation()}>
        <h2 id="ask-title" className="text-lg font-extrabold">
          Zapytaj o raport
        </h2>
        <p className="text-sm text-ink-3">
          Asystent odpowie tylko na podstawie danych z tego raportu i pokaże źródło pod odpowiedzią. Ta funkcja jest w przygotowaniu —
          raport działa w całości bez niej.
        </p>
        <input
          disabled
          placeholder="np. Ile wody zmieści zagłębienie?"
          className="min-h-12 rounded-xl border border-rule-strong bg-bg px-3.5 text-[15px]"
        />
        <button onClick={onClose} autoFocus className="min-h-11 self-end rounded-[10px] bg-primary px-4 text-sm font-semibold text-white">
          Zamknij
        </button>
      </div>
    </div>
  );
}
