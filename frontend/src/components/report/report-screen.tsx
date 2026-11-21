"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MapLayer, Report, Zalecenie } from "@/lib/types";
import { MobileNav } from "../mobile-nav";
import { printLight, ThemeToggle } from "../theme-toggle";
import { shortDate } from "@/lib/dates";
import { Card, ICON, Icon, Logo, StatusPill, Tank } from "../ui";
import { CAT, LAYERS, LEGEND } from "./map-style";
import { ActionList, Causes, Justification, PeriodSummaryCard, Risk, Sources } from "./sections";

// MapLibre needs the browser (WebGL), so the map is loaded on the client only.
const ParcelMap = dynamic(() => import("./parcel-map"), {
  ssr: false,
  loading: () => (
    <div className="grid aspect-[4/5] w-full place-items-center rounded-[14px] bg-[#DDE7D5] text-sm text-muted sm:aspect-[3/2]">Wczytuję mapę…</div>
  ),
});

export function ReportScreen({ report, url }: { report: Report; url: string }) {
  const p = report.parcel;
  const startHref = `/?${new URLSearchParams({ dzialka: p.id, data: report.date, ...(report.period ? { od: report.period.from } : {}) })}`;
  const outOfScope = report.status.tone === "poza-zakresem";

  // Print / "Save as PDF" shows collapsed sections too.
  useEffect(() => {
    const open = () => document.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);

  return (
    <div className="min-h-screen bg-bg pb-24 text-ink md:pb-0 print:pb-0">
      <header className="app-header border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-[1376px] flex-wrap items-center gap-3.5 px-8 py-3 max-sm:gap-2 max-sm:px-4">
          <Link href="/" className="no-print flex items-center gap-2.5 text-ink no-underline max-sm:hidden">
            <Logo size={32} />
            <span className="brand-name text-base font-extrabold">Asystent Wodny</span>
          </Link>
          <Link href={startHref} aria-label="Wróć do wyboru działki" className="no-print -ml-1 p-1 text-ink sm:hidden">
            <Icon d={ICON.chevronLeft} size={22} stroke={2.4} />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col border-rule sm:flex-none sm:border-l sm:pl-3.5">
            <span className="text-[17px] font-extrabold">
              Działka {p.number}
              {report.crop && ` · ${report.crop.name.toLowerCase()}`}{" "}
              {report.crop && <span className="text-xs font-semibold text-muted max-sm:hidden">({report.cropSource})</span>}
            </span>
            <span className="text-[13px] text-muted max-sm:text-xs">
              {report.period ? `okres ${shortDate(report.period.from)}–${shortDate(report.period.to)} · zalecenia na ${report.dateLong}` : `stan na ${report.dateLong}`}
              {!outOfScope && (
                <>
                  {" "}
                  · <span className="max-sm:hidden">porównanie z 10 sezonami </span>
                  {report.yearsLabel}
                </>
              )}{" "}
              · {p.areaHa.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} ha
            </span>
          </div>
          <div className="sm:hidden">
            <StatusPill tone={report.status.tone} label={report.status.label} small />
          </div>
          <nav className="no-print ml-auto flex flex-wrap gap-2 max-sm:hidden">
            <ThemeToggle />
            <Link
              href={startHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-btn)] border border-rule-strong bg-paper px-3.5 text-sm font-semibold text-ink no-underline hover:border-ink-3"
            >
              Zmień działkę lub dzień
            </Link>
            <button
              onClick={printLight}
              title="W oknie drukowania wybierz „Zapisz jako PDF”"
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-btn)] bg-btn px-3.5 text-sm font-semibold text-btn-ink hover:bg-btn-hover"
            >
              <Icon d={ICON.print} />
              Drukuj / zapisz PDF
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1376px] flex-col gap-5 px-8 pb-14 pt-6 max-sm:gap-4 max-sm:px-4 max-sm:pt-4">
        {outOfScope ? <OutOfScope report={report} startHref={startHref} /> : <AgriReport report={report} />}

        <Sources report={report} />

        <div className="no-print flex flex-wrap justify-center gap-2 sm:hidden">
          <ThemeToggle />
          <button
            onClick={printLight}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-btn)] border border-rule-strong bg-paper px-4 text-sm font-semibold text-ink"
          >
            <Icon d={ICON.print} />
            Drukuj / zapisz PDF
          </button>
        </div>

        <p className="text-center text-xs text-muted">
          Prototyp — dane przykładowe, nie wynik analizy prawdziwej działki.
          <span className="print-only">Raport: {url}</span>
        </p>
      </main>

      <MobileNav active="raport" reportHref={outOfScope ? null : url} />
    </div>
  );
}

const NO_ACTIONS: Zalecenie[] = [];
const noop = () => {};

function OutOfScope({ report, startHref }: { report: Report; startHref: string }) {
  return (
    <Card className="flex flex-col gap-3 p-6 max-sm:p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="max-sm:hidden">
          <StatusPill tone={report.status.tone} label={report.status.label} />
        </span>
        <h1 className="text-2xl font-extrabold leading-tight max-sm:text-xl">{report.headline}</h1>
      </div>
      <p className="max-w-[70ch] text-sm text-ink-2">{report.summary}</p>
      <div className="max-w-3xl">
        <ParcelMap parcel={report.parcel.geometry} data={report.map} actions={NO_ACTIONS} layer="plan" pin={0} onPin={noop} />
      </div>
      <Link
        href={startHref}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-[var(--r-btn)] bg-btn px-4 text-sm font-semibold text-btn-ink no-underline hover:bg-btn-hover"
      >
        Wskaż inną działkę
        <Icon d={ICON.arrowRight} />
      </Link>
    </Card>
  );
}

function AgriReport({ report }: { report: Report }) {
  const urgentAction = report.actions.find((a) => a.n === report.urgent?.n) ?? report.actions[0];
  const [pin, setPin] = useState<number>(urgentAction?.n ?? 0);
  const [layer, setLayer] = useState<MapLayer>("plan");
  const mapRef = useRef<HTMLDivElement>(null);

  const select = (a: Zalecenie, scroll = false) => {
    setPin(a.n);
    setLayer(a.warstwa);
    if (scroll) mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const showLayer = (l: MapLayer) => {
    setLayer(l);
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* Co Cię czeka: one sentence + soil water tank + the single most important action */}
      <Card className="print-break-avoid flex flex-wrap items-center gap-5 px-6 py-5 max-sm:gap-4 max-sm:p-4">
        <div className="flex min-w-0 flex-[999_1_520px] items-center gap-4">
          {report.soilWaterPct !== null && report.stressThresholdPct !== null && (
            <Tank
              pct={report.soilWaterPct}
              threshold={report.stressThresholdPct}
              label={`Woda w glebie: ${report.soilWaterPct} procent, próg stresu ${report.stressThresholdPct} procent`}
            />
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="max-sm:hidden">
                <StatusPill tone={report.status.tone} label={report.status.label} />
              </span>
              <h1 className="text-2xl font-extrabold leading-tight tracking-tight max-sm:text-xl">{report.headline}</h1>
            </div>
            <span className="text-sm leading-snug text-ink-2">{report.summary}</span>
            <span className="inline-flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2" title="Niezależne wskaźniki: opady, gleba, rośliny, próg IUNG">
              pewność
              <span className="inline-flex gap-[3px]" aria-hidden="true">
                {Array.from({ length: report.confidence.total }, (_, i) => (
                  <span key={i} className={`h-2 w-2 rounded-full ${i < report.confidence.agreeing ? "bg-primary" : "bg-rule-strong"}`} />
                ))}
              </span>
              <b>{report.confidence.level}</b> · {report.confidence.agreeing} z {report.confidence.total} wskaźników zgodne
              {report.confidence.note && <> · {report.confidence.note}</>}
            </span>
          </div>
        </div>
        {report.urgent && urgentAction && (
          <button
            onClick={() => select(urgentAction, true)}
            className="flex min-h-[72px] flex-[1_1_320px] items-center gap-3.5 rounded-[var(--r-card)] border-2 px-4 py-3 text-left text-ink"
            style={{ borderColor: CAT[urgentAction.kategoria].color, background: CAT[urgentAction.kategoria].bg }}
          >
            <span
              className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-base font-extrabold text-white"
              style={{ background: CAT[urgentAction.kategoria].color }}
            >
              {urgentAction.n}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-bold tracking-[0.05em]" style={{ color: CAT[urgentAction.kategoria].ink }}>
                {report.urgent.label}
              </span>
              <span className="text-base font-extrabold">{report.urgent.title}</span>
              <span className="text-[13px] text-ink-2">{report.urgent.sub}</span>
            </span>
          </button>
        )}
      </Card>

      <PeriodSummaryCard report={report} />

      {/* Map with layers + action list */}
      <section className="flex flex-wrap items-start gap-5" aria-label="Plan na działce">
        <div
          ref={mapRef}
          id="mapa"
          className="print-break-avoid flex min-w-0 flex-[999_1_640px] scroll-mt-4 flex-col gap-3.5 rounded-[var(--r-card)] border border-rule bg-paper p-[18px] max-sm:p-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-extrabold">Plan na Twojej działce</h2>
            <div role="tablist" aria-label="Widok mapy" className="no-print ml-auto flex flex-wrap gap-1 rounded-xl bg-chip p-1 max-sm:ml-0 max-sm:w-full">
              {(Object.keys(LAYERS) as MapLayer[]).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={layer === k}
                  onClick={() => setLayer(k)}
                  className={`min-h-10 rounded-[9px] px-3 text-[13px] max-sm:flex-1 max-sm:px-1.5 max-sm:text-xs ${layer === k ? "bg-tab-active font-bold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"}`}
                >
                  {LAYERS[k]}
                </button>
              ))}
            </div>
          </div>
          <ParcelMap parcel={report.parcel.geometry} data={report.map} actions={report.actions} layer={layer} pin={pin} onPin={select} />
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

      <section className="flex flex-wrap items-stretch gap-5 max-sm:gap-4" aria-label="Ryzyko i przyczyny">
        <Causes report={report} onShow={showLayer} />
        <Risk report={report} />
      </section>

      <Justification report={report} />
    </>
  );
}
