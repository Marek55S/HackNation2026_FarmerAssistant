"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MapLayer, Report, Zalecenie } from "@/lib/types";
import { farmEntry, OPENING_KEY, reportDate, useFarm } from "@/lib/farm";
import { AppHeader } from "../app-header";
import { Backdrop } from "../backdrop";
import { MobileNav } from "../mobile-nav";
import { SlidingPill } from "../sliding-pill";
import { printLight, ThemeToggle } from "../theme-toggle";
import { shortDate } from "@/lib/dates";
import { Card, ICON, Icon, StatusPill } from "../ui";
import { CAT, LAYERS, LEGEND } from "./map-style";
import { ActionList, Causes, CropParts, Justification, PeriodSummaryCard, Risk, RULE_ICON, SectionHead, Sources, Vulnerability } from "./sections";

// MapLibre needs the browser (WebGL), so the map is loaded on the client only.
const ParcelMap = dynamic(() => import("./parcel-map"), {
  ssr: false,
  loading: () => (
    <div className="grid aspect-[4/5] w-full place-items-center rounded-[14px] bg-[#DDE7D5] text-sm text-muted sm:aspect-[3/2]">Wczytuję mapę…</div>
  ),
});

export function ReportScreen({ report, url }: { report: Report; url: string }) {
  const p = report.parcel;
  const uprawy = cropLabel(report);
  const startHref = `/?${new URLSearchParams({ dzialka: p.id, data: report.date, ...(report.period ? { od: report.period.from } : {}) })}`;
  const outOfScope = report.status.tone === "poza-zakresem";

  // A parcel already in "Twoje gospodarstwo" gets this result, unless the stored one is for a later day
  // (opening an old report from history must not overwrite a newer check).
  const { farm, upsert } = useFarm();
  useEffect(() => {
    const e = farm.find((f) => f.parcelId === p.id);
    if (!e) return;
    const d = e.date ?? reportDate(e.url);
    if (e.tone && d && report.date < d) return;
    if (e.url === url && e.tone === report.status.tone && e.date === report.date) return;
    upsert(farmEntry(report, url));
  }, [farm, p.id, report, url, upsert]);

  // The report is here: the "just analysed" hint for the loading screen is used up.
  useEffect(() => {
    try {
      sessionStorage.removeItem(OPENING_KEY);
    } catch {
      // storage blocked
    }
  }, []);

  // Print / "Save as PDF" shows collapsed sections too.
  useEffect(() => {
    const open = () => document.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""));
    window.addEventListener("beforeprint", open);
    return () => window.removeEventListener("beforeprint", open);
  }, []);

  return (
    <div className="relative isolate min-h-screen pb-24 text-ink md:pb-0 print:pb-0">
      <Backdrop />
      <AppHeader active="raport" reportHref={outOfScope ? null : url}>
        <ThemeToggle className="max-sm:hidden" />
        <ShareButton url={url} title={`Działka ${p.number} · ${shortDate(report.date)}`} className="max-sm:hidden" />
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

      <main className="rise-children mx-auto flex max-w-[1376px] flex-col gap-5 px-8 pb-14 pt-6 max-sm:gap-4 max-sm:px-4 max-sm:pt-4">
        {/* Title row (Smartfarm "Welcome back" + date): what parcel, which day, where the data comes from */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 pt-2 max-sm:pt-0">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-[34px] font-bold leading-[1.1] tracking-tight max-sm:text-[26px]">
              Działka {p.number}
              {uprawy && <span className="font-medium text-ink-3"> · {uprawy}</span>}
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
            className="press cta no-print ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-[var(--r-btn)] border border-rule-strong bg-paper px-4 text-sm font-semibold text-ink no-underline hover:border-ink-3 max-sm:ml-0"
          >
            Zmień działkę lub dzień
            <Icon d={ICON.chevronRight} size={15} />
          </Link>
        </div>

        {!outOfScope && <JumpNav report={report} />}

        {outOfScope ? <OutOfScope report={report} startHref={startHref} /> : <AgriReport report={report} />}

        <Sources report={report} />

        <div className="no-print flex flex-wrap justify-center gap-2 sm:hidden">
          <ThemeToggle />
          <ShareButton url={url} title={`Działka ${p.number} · ${shortDate(report.date)}`} />
          <button
            onClick={printLight}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r-btn)] border border-rule-strong bg-paper px-4 text-sm font-semibold text-ink"
          >
            <Icon d={ICON.print} />
            Drukuj / zapisz PDF
          </button>
        </div>

        <p className="text-center text-xs text-muted">
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
        <dl className="reveal flex flex-col gap-2.5 border-t border-[#E2E2D6] px-3.5 py-3 text-[13px]">
          <div className="flex justify-between gap-2">
            <dt className="text-[#687266]">Powierzchnia</dt>
            <dd className="tabular font-semibold">{p.areaHa.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} ha</dd>
          </div>
          {cropLabel(report) && (
            <div className="flex justify-between gap-2">
              <dt className="text-[#687266]">{report.parts.length > 1 ? "Uprawy" : "Uprawa"}</dt>
              <dd className="text-right font-semibold">{cropLabel(report)}</dd>
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

/**
 * Short jumps to the report's sections, sticky while scrolling; the section being read is highlighted.
 * Order is the report's own (KOWR 3.3: state → 10 years and causes → plan → what next → sources).
 */
function JumpNav({ report }: { report: Report }) {
  const items = [
    { id: "stan", label: "Stan" },
    report.vulnerability && (report.justification?.history.length ?? 0) > 0 ? { id: "historia", label: "10 lat" } : null,
    report.causes.length > 0 ? { id: "przyczyny", label: "Przyczyny" } : null,
    { id: "mapa", label: "Plan" },
    report.risk ? { id: "co-dalej", label: "Co dalej" } : null,
    { id: "zrodla", label: "Źródła" },
  ].filter((x): x is { id: string; label: string } => !!x);
  const [active, setActive] = useState(items[0].id);
  const ids = items.map((i) => i.id).join(",");

  useEffect(() => {
    const els = ids.split(",").map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    // A section counts as "being read" when it crosses a band a third of the way down the screen.
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [ids]);

  return (
    <nav aria-label="Sekcje raportu" className="jump-nav no-print sticky z-20 -my-1 self-start max-sm:self-stretch">
      <ul className="flex gap-1 overflow-x-auto rounded-full border border-rule bg-paper/90 p-1 shadow-sm backdrop-blur [scrollbar-width:none]">
        {items.map((i) => (
          <li key={i.id} className="flex-none">
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "location" : undefined}
              onClick={(e) => {
                // Smooth only here (not page-wide, which would also animate route changes); instant with reduced motion.
                const el = document.getElementById(i.id);
                if (!el) return;
                e.preventDefault();
                setActive(i.id);
                el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
                history.replaceState(null, "", `#${i.id}`);
              }}
              className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px] no-underline transition-colors ${
                active === i.id ? "bg-btn font-semibold text-btn-ink" : "font-medium text-ink-2 hover:bg-chip hover:text-ink"
              }`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Share the report: the phone's own share sheet where there is one (touch screens), otherwise copy the link.
 * The link carries parcel, date, period and crop, so whoever opens it sees the same report.
 */
function ShareButton({ url, title, className = "" }: { url: string; title: string; className?: string }) {
  const [done, setDone] = useState<"copied" | "failed" | null>(null);
  async function share() {
    const href = new URL(url, location.origin).toString();
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, url: href });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(href);
      setDone("copied");
    } catch {
      // Clipboard API blocked (embedded browser, plain http): the older copy command still works in most of them.
      const ta = document.createElement("textarea");
      ta.value = href;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      setDone(ok ? "copied" : "failed");
    }
    setTimeout(() => setDone(null), 2200);
  }
  return (
    <button
      type="button"
      onClick={share}
      className={`inline-flex min-h-10 items-center gap-2 rounded-[var(--r-btn)] border border-rule-strong bg-paper px-4 text-sm font-semibold text-ink hover:border-ink-3 max-sm:min-h-11 ${className}`}
    >
      <Icon d={done === "copied" ? ICON.check : ICON.link} />
      <span aria-live="polite">{done === "copied" ? "Skopiowano link" : done === "failed" ? "Nie udało się skopiować" : "Kopiuj link"}</span>
    </button>
  );
}

/**
 * Counts the first number in `value` up from zero once, when the card appears ("24%", "7 z 10").
 * React always renders the final text (server, print, no-JS); only the browser's frames show the count,
 * so a stalled frame loop (background tab) leaves the real value, never a half-counted one.
 */
function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const m = value.match(/\d+/);
    if (!el || !m || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = Number(m[0]);
    let id = 0;
    let t0: number | null = null;
    const tick = (t: number) => {
      t0 ??= t;
      const p = Math.min(1, (t - t0) / 800);
      el.textContent = value.replace(m[0], String(Math.round(target * (1 - (1 - p) ** 3))));
      if (p < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    const finish = () => (el.textContent = value);
    addEventListener("beforeprint", finish);
    return () => {
      cancelAnimationFrame(id);
      removeEventListener("beforeprint", finish);
    };
  }, [value]);
  // Keyed by value: a new value gets a fresh element instead of fighting over the text node.
  return (
    <span key={value} ref={ref}>
      {value}
    </span>
  );
}

/** Water in the root zone as a small tank, with the crop's stress threshold as a dashed line (dark card). */
function SoilTank({ pct, threshold }: { pct: number; threshold: number }) {
  const below = pct < threshold;
  return (
    <span
      className="relative h-14 w-8 flex-none overflow-hidden rounded-lg border-2 border-white/35 bg-white/5"
      role="img"
      aria-label={`Zapas wody ${pct}%, próg stresu ${threshold}%`}
    >
      <span
        className={`tank-fill absolute inset-x-0 bottom-0 ${below ? "bg-[#e9784a]" : "bg-[#5aa0f0]"}`}
        style={{ height: `${Math.max(0, Math.min(100, pct))}%` }}
      />
      <span className="absolute inset-x-0 border-t-2 border-dashed border-white/80" style={{ bottom: `${threshold}%` }} />
    </span>
  );
}

/**
 * Key numbers for the feature card — the state on day D and the 10-year vulnerability (task 3.3 pt 4).
 * Scenario numbers ("jak bywało") live in the Risk section further down, so they are not read as today's state.
 */
/** Nagłówek wymienia uprawy z działki (po podziale na części), a nie tylko tę dominującą. */
function cropLabel(r: Report): string {
  const n = r.parts.map((c) => c.crop?.name.toLowerCase()).filter((x): x is string => !!x);
  if (n.length === 0) return r.crop ? r.crop.name.toLowerCase() : "";
  if (n.length <= 2) return n.join(" i ");
  return `${n[0]} i ${n.length - 1} inne uprawy`;
}

function stateCells(r: Report) {
  const cells: { label: string; value: string; note: string; tank?: { pct: number; threshold: number } }[] = [];
  // Zapas wody zależy od rośliny, więc przy kilku uprawach liczby u góry dotyczą największej części.
  const glowna = r.parts.length > 1 && r.parts[0].crop ? ` · część ${r.parts[0].areaHa.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} ha` : "";
  if (r.soilWaterPct !== null)
    cells.push({
      label: "Woda w glebie",
      value: `${r.soilWaterPct}%`,
      note: `zapas w strefie korzeni, ${shortDate(r.date)}${glowna}`,
      tank: r.stressThresholdPct !== null ? { pct: r.soilWaterPct, threshold: r.stressThresholdPct } : undefined,
    });
  if (r.stressThresholdPct !== null)
    cells.push({ label: "Próg stresu", value: `${r.stressThresholdPct}%`, note: r.crop ? `dla: ${r.crop.name.toLowerCase()}${glowna}` : "" });
  if (r.vulnerability && r.vulnerability.seasons > 0) {
    const v = r.vulnerability;
    cells.push({
      label: "Sezony z suszą",
      value: `${v.drought} z ${v.seasons}`,
      note: v.months.length ? `najczęściej w ${v.months.join(" i ")}` : r.yearsLabel,
    });
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
      <section id="stan" className="print-break-avoid grid gap-5 max-sm:gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" aria-label="Co Cię czeka">
        <div className="flex flex-col gap-5 rounded-[var(--r-card)] bg-feature p-6 text-feature-ink max-sm:p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <StatusPill tone={report.status.tone} label={report.status.label} onDark />
            <span className="text-[13px] text-feature-muted">
              pewność <b className="font-semibold text-feature-ink">{report.confidence.level}</b> · {report.confidence.agreeing} z{" "}
              {report.confidence.total} wskaźników zgodne · stan na {shortDate(report.date)}
              {report.confidence.note && <> · {report.confidence.note}</>}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-feature-ink max-sm:text-[22px]">{report.headline}</h2>
            <p className="max-w-[68ch] text-[15px] leading-relaxed text-feature-muted">{report.summary}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {stateCells(report).map((c, i, all) => (
              <div
                key={c.label}
                className={`flex items-center gap-3 rounded-2xl bg-feature-cell px-4 py-3 ${all.length % 2 === 1 && i === all.length - 1 ? "max-sm:col-span-2" : ""}`}
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <dt className="text-xs text-feature-muted">{c.label}</dt>
                  <dd className="tabular font-[family-name:var(--font-display)] text-2xl font-semibold leading-none">
                    <CountUp value={c.value} />
                  </dd>
                  <dd className="text-[11px] text-feature-muted">{c.note}</dd>
                </div>
                {c.tank && <SoilTank {...c.tank} />}
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
              {/* Pictogram of the action (as in the action list); the small number matches the pin on the map. */}
              <span className="relative flex-none">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-primary-border bg-paper text-heading">
                  <Icon d={RULE_ICON[urgentAction.regula] ?? ICON.check} size={28} stroke={1.6} />
                </span>
                <span
                  className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-primary-tint bg-heading px-1 text-[11px] font-bold text-on-primary"
                  aria-label={`działanie ${urgentAction.n} na mapie`}
                >
                  {urgentAction.n}
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-[family-name:var(--font-display)] text-xl font-semibold leading-snug text-heading">{report.urgent.title}</span>
                <span className="text-sm text-ink-2">{report.urgent.sub}</span>
              </span>
            </span>
            {/* The urgent action's key facts, so the card answers "when, how much, what for" without scrolling. */}
            <dl className="grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-primary-border pt-3 text-[13px]">
              <dt className="text-muted">Kiedy</dt>
              <dd className="text-ink">{urgentAction.kiedy}</dd>
              <dt className="text-muted">Gdzie</dt>
              <dd className="text-ink">{urgentAction.gdzie}</dd>
              {urgentAction.ile && (
                <>
                  <dt className="text-muted">Ile</dt>
                  <dd className="text-ink">{urgentAction.ile}</dd>
                </>
              )}
              <dt className="text-muted">Zyskasz</dt>
              <dd className="font-semibold text-heading">{urgentAction.co_zyskasz}</dd>
            </dl>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-heading">
              Pokaż na mapie
              <Icon d={ICON.arrowRight} size={15} className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </button>
        )}
      </section>

      <CropParts
        report={report}
        onPick={(n) => {
          const a = report.actions.find((x) => x.n === n);
          if (a) select(a, true);
        }}
      />

      <PeriodSummaryCard report={report} />

      {/* Order follows the KOWR task (3.3 pt 4–5), not the mock-up: state on day D (above) → 10-year vulnerability and
          causes → plan → scenarios. See makieta-ui/README.md. */}
      <section className="flex flex-col gap-5 max-sm:gap-4" aria-label="Podatność i przyczyny">
        <Vulnerability report={report} />
        <Causes report={report} onShow={showLayer} />
      </section>

      {/* Map with layers + action list */}
      <section className="flex flex-wrap items-start gap-5" aria-label="Plan na działce">
        <div
          ref={mapRef}
          id="mapa"
          className="print-break-avoid flex min-w-0 flex-[999_1_640px] scroll-mt-4 flex-col gap-3.5 rounded-[var(--r-card)] border border-rule bg-paper p-[18px] max-sm:p-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <SectionHead eyebrow="Co zrobić" title="Plan na Twojej działce" />
            <div role="tablist" aria-label="Widok mapy" className="no-print relative ml-auto flex flex-wrap gap-1 rounded-[22px] bg-chip p-1 max-sm:ml-0 max-sm:w-full">
              <SlidingPill active={layer} />
              {(Object.keys(LAYERS) as MapLayer[]).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={layer === k}
                  onClick={() => setLayer(k)}
                  className={`relative min-h-10 rounded-full px-3 text-[13px] max-sm:flex-1 max-sm:px-1.5 max-sm:text-xs ${layer === k ? "font-bold text-ink" : "font-medium text-ink-2 hover:text-ink"}`}
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
        <aside className="flex min-w-0 flex-[1_1_380px] flex-col rounded-[var(--r-card)] border border-rule bg-paper p-[18px] max-sm:p-3">
          <ActionList
            actions={report.actions}
            parts={report.parts}
            pin={pin}
            onPick={(a) => select(a, window.matchMedia("(max-width: 1100px)").matches)}
          />
        </aside>
      </section>

      <section className="flex flex-wrap items-stretch gap-5 max-sm:gap-4" aria-label="Co może się wydarzyć">
        <Risk report={report} />
      </section>

      <Justification report={report} />
    </>
  );
}
