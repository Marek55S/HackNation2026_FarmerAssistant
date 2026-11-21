"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MapLayer, Report, Zalecenie } from "@/lib/types";
import { AppHeader } from "../app-header";
import { MobileNav } from "../mobile-nav";
import { printLight, ThemeToggle } from "../theme-toggle";
import { shortDate } from "@/lib/dates";
import { Card, ICON, Icon, StatusPill } from "../ui";
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
      <AppHeader active="raport" reportHref={outOfScope ? null : url}>
        <ThemeToggle className="max-sm:hidden" />
        <button
          onClick={printLight}
          title="W oknie drukowania wybierz „Zapisz jako PDF”"
          className="inline-flex min-h-10 items-center gap-2 rounded-[var(--r-btn)] bg-btn px-4 text-sm font-semibold text-btn-ink hover:bg-btn-hover max-sm:hidden"
        >
          <Icon d={ICON.print} />
          Drukuj / PDF
        </button>
        <span className="sm:hidden">
          <StatusPill tone={report.status.tone} label={report.status.label} small />
        </span>
      </AppHeader>

      <main className="mx-auto flex max-w-[1376px] flex-col gap-5 px-8 pb-14 pt-6 max-sm:gap-4 max-sm:px-4 max-sm:pt-4">
        {/* Title row (Smartfarm "Welcome back" + date): what parcel, which day, where the data comes from */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-2 max-sm:pt-0">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-[34px] font-bold leading-[1.1] tracking-tight max-sm:text-[26px]">
              Działka {p.number}
              {report.crop && <span className="font-medium text-ink-3"> · {report.crop.name.toLowerCase()}</span>}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Icon d={ICON.calendar} size={16} className="text-muted" />
                {report.period
                  ? `${shortDate(report.period.from)} – ${shortDate(report.period.to)} · zalecenia na ${report.dateLong}`
                  : report.dateLong}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon d={ICON.pin} size={16} className="text-muted" />
                obręb {p.obreb}, gm. {p.gmina} · {p.areaHa.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} ha
              </span>
              {report.crop && <span className="text-muted max-sm:hidden">uprawa: {report.cropSource}</span>}
            </div>
          </div>
          <Link
            href={startHref}
            className="press no-print ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-[var(--r-btn)] border border-rule-strong bg-paper px-4 text-sm font-semibold text-ink no-underline hover:border-ink-3 max-sm:ml-0"
          >
            Zmień działkę lub dzień
            <Icon d={ICON.chevronRight} size={15} />
          </Link>
        </div>

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

/**
 * Floating "Podsumowanie" panel over the map (FarmSense "Quick Summary"): the parcel at a glance.
 * Sits on the photo, so it keeps light colours in both looks. Hidden on phones (the map is too small).
 */
function MapSummary({ report }: { report: Report }) {
  const [open, setOpen] = useState(true);
  const p = report.parcel;
  const counts = (["ret", "agro", "irr"] as const).map((k) => ({ k, n: report.actions.filter((a) => a.kategoria === k).length }));
  return (
    <div className="no-print absolute right-2.5 top-2.5 z-10 w-[236px] overflow-hidden rounded-2xl bg-[#FBFBF7]/95 text-[#1D2B22] shadow-[0_4px_16px_rgba(0,0,0,0.18)] max-sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3.5 py-2.5 text-left text-xs font-bold uppercase tracking-[0.06em] text-[#2F4D3C]"
      >
        <Icon d={ICON.chevronRight} size={14} className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        Podsumowanie
      </button>
      {open && (
        <dl className="flex flex-col gap-2.5 border-t border-[#E2E2D6] px-3.5 py-3 text-[13px]">
          <div className="flex justify-between gap-2">
            <dt className="text-[#687266]">Powierzchnia</dt>
            <dd className="tabular font-semibold">{p.areaHa.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} ha</dd>
          </div>
          {report.crop && (
            <div className="flex justify-between gap-2">
              <dt className="text-[#687266]">Uprawa</dt>
              <dd className="font-semibold">{report.crop.name.toLowerCase()}</dd>
            </div>
          )}
          {report.soilWaterPct !== null && report.stressThresholdPct !== null && (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-2">
                <dt className="text-[#687266]">Woda w glebie</dt>
                <dd className="tabular font-semibold">{report.soilWaterPct}%</dd>
              </div>
              <dd className="relative h-1.5 rounded-full bg-[#E6E7DB]" aria-hidden="true">
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${report.soilWaterPct}%`, background: "#2a78d6" }}
                />
                <span className="absolute -top-1 bottom-[-4px] w-0.5 bg-[#1D2B22]" style={{ left: `${report.stressThresholdPct}%` }} title="próg stresu" />
              </dd>
              <dd className="text-[11px] text-[#687266]">kreska = próg stresu {report.stressThresholdPct}%</dd>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <dt className="text-[#687266]">Zalecenia</dt>
            <dd className="flex flex-wrap gap-x-3 gap-y-1">
              {counts
                .filter((c) => c.n > 0)
                .map((c) => (
                  <span key={c.k} className="inline-flex items-center gap-1.5 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT[c.k].color }} />
                    {c.n} · {CAT[c.k].name.replace(/^\d · /, "").toLowerCase()}
                  </span>
                ))}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** Key numbers for the feature card — all straight from the report. */
function stateCells(r: Report) {
  const cells: { label: string; value: string; note: string }[] = [];
  if (r.soilWaterPct !== null) cells.push({ label: "Woda w glebie", value: `${r.soilWaterPct}%`, note: "zapas w strefie korzeni" });
  if (r.stressThresholdPct !== null) cells.push({ label: "Próg stresu", value: `${r.stressThresholdPct}%`, note: r.crop ? `dla: ${r.crop.name.toLowerCase()}` : "" });
  if (r.risk) {
    const max = Math.max(...r.risk.noAction);
    const i = r.risk.noAction.indexOf(max);
    cells.push({ label: "Ryzyko bez działań", value: `${max}/${r.scenarios}`, note: `scenariuszy · ${r.risk.cols[i]}` });
    cells.push({ label: "Z planem", value: `${r.risk.withPlan[i]}/${r.scenarios}`, note: `scenariuszy · ${r.risk.cols[i]}` });
  }
  return cells;
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
        <h2 className="text-2xl font-bold leading-tight max-sm:text-xl">{report.headline}</h2>
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
      {/* Co Cię czeka: dark feature card with the state in numbers (Planto's weather card) + the one urgent action */}
      <section className="print-break-avoid grid gap-5 max-sm:gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-label="Co Cię czeka">
        <div className="flex flex-col gap-5 rounded-[var(--r-card)] bg-feature p-6 text-feature-ink max-sm:p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusPill tone={report.status.tone} label={report.status.label} onDark />
            <span className="text-[13px] text-feature-muted">
              pewność <b className="font-semibold text-feature-ink">{report.confidence.level}</b> · {report.confidence.agreeing} z{" "}
              {report.confidence.total} wskaźników zgodne
              {report.confidence.note && <> · {report.confidence.note}</>}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-feature-ink max-sm:text-[22px]">{report.headline}</h2>
            <p className="max-w-[68ch] text-[15px] leading-relaxed text-feature-muted">{report.summary}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {stateCells(report).map((c) => (
              <div key={c.label} className="flex flex-col gap-1 rounded-2xl bg-feature-cell px-4 py-3">
                <dt className="text-xs text-feature-muted">{c.label}</dt>
                <dd className="tabular font-[family-name:var(--font-display)] text-2xl font-semibold leading-none">{c.value}</dd>
                <dd className="text-[11px] text-feature-muted">{c.note}</dd>
              </div>
            ))}
          </dl>
        </div>
        {report.urgent && urgentAction && (
          <button
            onClick={() => select(urgentAction, true)}
            className="group flex flex-col items-start gap-3 rounded-[var(--r-card)] border border-primary-border bg-primary-tint p-6 text-left text-ink max-sm:p-4"
          >
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-heading">{report.urgent.label.toLowerCase()}</span>
            <span className="flex items-start gap-3">
              <span
                className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full text-base font-extrabold text-white"
                style={{ background: CAT[urgentAction.kategoria].color }}
              >
                {urgentAction.n}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-[family-name:var(--font-display)] text-xl font-semibold leading-snug text-heading">{report.urgent.title}</span>
                <span className="text-sm text-ink-2">{report.urgent.sub}</span>
              </span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-heading">
              Pokaż na mapie
              <Icon d={ICON.arrowRight} size={15} className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </button>
        )}
      </section>

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
            <div role="tablist" aria-label="Widok mapy" className="no-print ml-auto flex flex-wrap gap-1 rounded-[22px] bg-chip p-1 max-sm:ml-0 max-sm:w-full">
              {(Object.keys(LAYERS) as MapLayer[]).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={layer === k}
                  onClick={() => setLayer(k)}
                  className={`min-h-10 rounded-full px-3 text-[13px] max-sm:flex-1 max-sm:px-1.5 max-sm:text-xs ${layer === k ? "bg-tab-active font-bold text-ink shadow-sm" : "font-medium text-ink-2 hover:text-ink"}`}
                >
                  {LAYERS[k]}
                </button>
              ))}
            </div>
          </div>
          <ParcelMap parcel={report.parcel.geometry} data={report.map} actions={report.actions} layer={layer} pin={pin} onPin={select}>
            <MapSummary report={report} />
          </ParcelMap>
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
