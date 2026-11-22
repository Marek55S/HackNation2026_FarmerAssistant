"use client";

// The report as a document for "Drukuj / PDF": title page with the parcel's particulars, numbered chapters,
// tables instead of cards, and the map views as numbered figures with captions, legend, scale bar and north arrow.
// Hidden on screen; in print it replaces the interactive page (see `.print-doc` in globals.css).
// Map figures are still images made by map-snapshot.ts when the print button is pressed.

import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { MapLayer, Report, Zalecenie } from "@/lib/types";
import { longDate, shortDate, todayIso } from "@/lib/dates";
import { CAT, LAYERS, LEGEND, partColor } from "./map-style";
import { SNAP_W, type MapSnapshot } from "./map-snapshot";

const ha = (v: number) => v.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
const num = (v: number) => v.toLocaleString("pl-PL");
const cropName = (r: Report, id: string | null) => {
  if (!id) return "cała działka";
  const p = r.parts.find((x) => x.id === id);
  return p?.crop?.name.toLowerCase() ?? "część bez uprawy";
};

// ---- Figures -------------------------------------------------------------------------------------------------

interface FigureSpec {
  key: string;
  layer: MapLayer;
  part: string | null;
  pins: Zalecenie[];
  labels: boolean;
  title: string;
  /** Printed half width (two side by side) */
  small?: boolean;
}

function hasView(r: Report, k: Exclude<MapLayer, "plan">) {
  return !!r.map.rasters[k] || r.map.features.some((f) => f.layers.includes(k));
}

/** All map views of the document, in reading order. */
function figureSpecs(r: Report): FigureSpec[] {
  const many = r.parts.length > 1;
  const specs: FigureSpec[] = [
    {
      key: "dzialka",
      layer: "plan",
      part: null,
      pins: [],
      labels: false,
      title: many ? `Działka ${r.parcel.number} z podziałem na uprawy` : `Działka ${r.parcel.number} na ortofotomapie`,
    },
  ];
  if (many)
    r.parts.forEach((p) => {
      if (p.geometry)
        specs.push({
          key: `czesc-${p.id}`,
          layer: "plan",
          part: p.id,
          pins: r.actions.filter((a) => a.czesc === p.id),
          labels: false,
          title: `${p.crop?.name ?? "Część bez uprawy"} (${ha(p.areaHa)} ha) i działania dla tej uprawy`,
          small: true,
        });
    });
  if (r.actions.length > 0)
    specs.push({ key: "plan", layer: "plan", part: null, pins: r.actions, labels: true, title: "Plan działań — numery na mapie odpowiadają numerom działań poniżej" });
  for (const k of ["sucho", "teren", "gleba"] as const)
    if (hasView(r, k)) specs.push({ key: k, layer: k, part: null, pins: [], labels: true, title: LAYERS[k] });
  return specs;
}

export type FigureState = MapSnapshot | "error";

/**
 * Figures for the document, made on demand (the print button) and kept for the next print.
 * `prepare` resolves once every figure is done or has failed.
 */
export function usePrintFigures(report: Report) {
  const [figures, setFigures] = useState<Record<string, FigureState>>({});
  const [preparing, setPreparing] = useState(false);
  const [madeOn, setMadeOn] = useState<string | null>(null);
  const done = useRef<Record<string, FigureState>>({});
  const prepare = useCallback(async () => {
    setPreparing(true);
    try {
      const { snapshotMap } = await import("./map-snapshot");
      for (const s of figureSpecs(report)) {
        if (done.current[s.key] && done.current[s.key] !== "error") continue;
        try {
          done.current[s.key] = await snapshotMap({
            parcel: report.parcel.geometry,
            data: report.map,
            parts: report.parts,
            layer: s.layer,
            part: s.part,
            pins: s.pins,
            labels: s.labels,
            markScale: s.small ? 1.8 : 1,
          });
        } catch {
          done.current[s.key] = "error";
        }
        setFigures({ ...done.current });
      }
      setMadeOn(todayIso());
    } finally {
      setPreparing(false);
    }
  }, [report]);
  return { figures, prepare, preparing, madeOn };
}

/** Round distance for the scale bar: the largest that fits in about a fifth of the image. */
function scaleBar(mpp: number): { m: number; pct: number } {
  const max = SNAP_W * 0.22 * mpp;
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const m = steps.filter((s) => s <= max).pop() ?? steps[0];
  return { m, pct: (m / mpp / SNAP_W) * 100 };
}

function Legend({ items }: { items: { style: CSSProperties; t: string }[] }) {
  return (
    <ul className="pd-legend">
      {items.map((i) => (
        <li key={i.t}>
          <span style={i.style} aria-hidden="true" />
          {i.t}
        </li>
      ))}
    </ul>
  );
}

function legendFor(r: Report, s: FigureSpec) {
  const boundary = { style: { width: 16, height: 0, borderTop: "3px solid #F2C14E" }, t: "granica działki" };
  const partItems = r.parts.length > 1 ? r.parts.map((p, i) => ({ style: { width: 14, height: 14, borderRadius: 3, border: `2px solid ${partColor(i)}`, background: `${partColor(i)}55`, boxSizing: "border-box" as const }, t: `${p.crop?.name ?? "bez uprawy"} · ${ha(p.areaHa)} ha` })) : [];
  if (s.key === "dzialka") return [boundary, ...partItems];
  if (s.layer === "plan") {
    const cats = [...new Set(s.pins.map((a) => a.kategoria))];
    return [...cats.map((c) => ({ style: { width: 14, height: 14, borderRadius: 99, background: CAT[c].color }, t: `${CAT[c].name.replace(/^\d · /, "")} (nr działania)` })), boundary];
  }
  return LEGEND[s.layer];
}

function Figure({ n, spec, state, report, small = false }: { n: number; spec: FigureSpec; state: FigureState | undefined; report: Report; small?: boolean }) {
  const info = spec.layer !== "plan" ? report.mapInfo[spec.layer] : null;
  const bar = state && state !== "error" ? scaleBar(state.mpp) : null;
  return (
    <figure className={`pd-figure ${small ? "pd-figure-small" : ""}`}>
      <div className="pd-map">
        {state && state !== "error" ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL made in the browser, nothing to optimise */}
            <img src={state.src} alt={`Rys. ${n}. ${spec.title}`} />
            <span className="pd-north" aria-label="północ">
              <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true">
                <path d="M9 1l6 14-6-3.5L3 15z" fill="#1A1C19" stroke="#fff" strokeWidth="1" />
                <text x="9" y="21.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#1A1C19">N</text>
              </svg>
            </span>
            {bar && (
              <span className="pd-scale">
                <span className="pd-scale-bar" style={{ width: `${bar.pct}%` }} />
                <span>{bar.m >= 1000 ? `${bar.m / 1000} km` : `${bar.m} m`}</span>
              </span>
            )}
          </>
        ) : (
          <span className="pd-map-missing">
            {state === "error"
              ? "Nie udało się przygotować tej mapy (serwis map nie odpowiedział)."
              : "Mapa pojawia się w PDF, gdy raport drukujesz przyciskiem „Drukuj / PDF”."}
          </span>
        )}
      </div>
      <figcaption>
        <b>Rys. {n}.</b> {spec.title}.{info ? ` ${info.say}` : ""}
        <Legend items={legendFor(report, spec)} />
        <span className="pd-src">
          Podkład: {state && state !== "error" && state.base === "osm" ? "© OpenStreetMap contributors" : "Ortofotomapa © GUGiK (geoportal.gov.pl)"}
          {info?.src ? ` · Dane: ${info.src}` : ""}
        </span>
      </figcaption>
    </figure>
  );
}

// ---- Document ------------------------------------------------------------------------------------------------

/** Numbered chapter. `lead` (a figure, usually) is kept on the same page as the heading. */
function Chapter({ n, title, lead, children }: { n: number; title: string; lead?: ReactNode; children?: ReactNode }) {
  const h = (
    <h2>
      <span>{n}.</span> {title}
    </h2>
  );
  return (
    <section className="pd-chapter">
      {lead ? (
        <div className="pd-keep">
          {h}
          {lead}
        </div>
      ) : (
        h
      )}
      {children}
    </section>
  );
}

function ActionBlock({ a, report }: { a: Zalecenie; report: Report }) {
  const rows: [string, ReactNode][] = [
    ["Dotyczy", cropName(report, a.czesc)],
    ["Gdzie", a.gdzie],
    ["Kiedy", a.kiedy],
  ];
  if (a.ile) rows.push(["Ile", a.ile]);
  rows.push(["Co zyskasz", a.co_zyskasz]);
  if (a.bo.length) rows.push(["Dlaczego", a.bo.join("; ")]);
  return (
    <article className="pd-action">
      <h3>
        <span className="pd-num" style={{ background: CAT[a.kategoria].color }}>
          {a.n}
        </span>
        {a.co}
        <span className="pd-cat">{CAT[a.kategoria].name.replace(/^\d · /, "")}</span>
      </h3>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {a.kroki.length > 0 && (
        <ol className="pd-steps">
          {a.kroki.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ol>
      )}
    </article>
  );
}

export function PrintDocument({ report, url, figures, madeOn }: { report: Report; url: string; figures: Record<string, FigureState>; madeOn: string | null }) {
  const r = report;
  const p = r.parcel;
  const specs = figureSpecs(r);
  const figNo = new Map(specs.map((s, i) => [s.key, i + 1]));
  const fig = (key: string, small = false) => {
    const s = specs.find((x) => x.key === key);
    return s ? <Figure key={key} n={figNo.get(key)!} spec={s} state={figures[key]} report={r} small={small} /> : null;
  };
  const partFigs = specs.filter((s) => s.key.startsWith("czesc-"));
  const condFigs = specs.filter((s) => s.layer !== "plan");
  const crops = r.parts.map((x) => x.crop?.name.toLowerCase()).filter(Boolean).join(", ") || r.crop?.name.toLowerCase() || "nie wskazano";
  const history = r.justification?.history ?? [];
  const footer = `Hydrowise · działka ${p.number} · ${shortDate(r.date)}`.replace(/["\\]/g, "");

  let ch = 0;
  const next = () => ++ch;

  return (
    <article className="print-doc">
      {/* Running footer with page numbers (CSS page margin boxes; ignored by browsers without them). */}
      <style>{`@page { @bottom-left { content: "${footer}"; font: 8pt 'Inter Variable', Inter, sans-serif; color: #687266; } @bottom-right { content: "Strona " counter(page) " z " counter(pages); font: 8pt 'Inter Variable', Inter, sans-serif; color: #687266; } }`}</style>

      <header className="pd-title">
        <p className="pd-kicker">Hydrowise · raport wodny działki rolnej</p>
        <h1>Działka {p.number}</h1>
        <p className="pd-sub">
          {crops} · stan na {r.dateLong}
        </p>
        <table className="pd-meta">
          <tbody>
            <tr>
              <th>Identyfikator działki</th>
              <td>{p.id}</td>
              <th>Powierzchnia</th>
              <td>{ha(p.areaHa)} ha</td>
            </tr>
            <tr>
              <th>Położenie</th>
              <td>
                obręb {p.obreb}, gm. {p.gmina}, woj. {p.wojewodztwo}
              </td>
              <th>Użytkowanie</th>
              <td>{p.landUse}</td>
            </tr>
            <tr>
              <th>Dzień analizy</th>
              <td>{r.dateLong}</td>
              <th>Okres danych</th>
              <td>{r.period ? `${shortDate(r.period.from)} – ${shortDate(r.period.to)} (${r.period.days} dni)` : "stan na dzień analizy"}</td>
            </tr>
            <tr>
              <th>Pewność oceny</th>
              <td>
                {r.confidence.level} ({r.confidence.agreeing} z {r.confidence.total} sygnałów zgodnych)
              </td>
              <th>Wygenerowano</th>
              <td>{madeOn ? longDate(madeOn) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </header>

      <section className="pd-summary">
        <p className="pd-status">
          Ocena: <b>{r.status.label}</b>
        </p>
        <p className="pd-headline">{r.headline}</p>
        <p>{r.summary}</p>
        {r.urgent && (
          <p className="pd-urgent">
            <b>{r.urgent.label}:</b> działanie {r.urgent.n} — {r.urgent.title} ({r.urgent.sub})
          </p>
        )}
      </section>

      <Chapter n={next()} title={r.parts.length > 1 ? "Działka i uprawy" : "Działka i uprawa"} lead={fig("dzialka")}>
        <table className="pd-table">
          <thead>
            <tr>
              <th>Uprawa</th>
              <th className="r">Pow.</th>
              <th className="r">Udział</th>
              <th className="r">Woda w glebie</th>
              <th className="r">Próg stresu</th>
              <th>Ocena</th>
              <th>Źródło uprawy</th>
            </tr>
          </thead>
          <tbody>
            {r.parts.map((x, i) => (
              <tr key={x.id}>
                <td>
                  {r.parts.length > 1 && <span className="pd-swatch" style={{ borderColor: partColor(i), background: `${partColor(i)}55` }} />}
                  {x.crop?.name ?? "bez uprawy"}
                </td>
                <td className="r">{ha(x.areaHa)} ha</td>
                <td className="r">{x.sharePct}%</td>
                <td className="r">{x.soilWaterPct !== null ? `${x.soilWaterPct}%` : "—"}</td>
                <td className="r">{x.stressThresholdPct !== null ? `${x.stressThresholdPct}%` : "—"}</td>
                <td>{x.status.label}</td>
                <td className="pd-muted">{x.manual ? "wskazane przez rolnika" : x.cropSource}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.parts.some((x) => x.headline) && (
          <ul className="pd-list">
            {r.parts.map((x) => (
              <li key={x.id}>
                <b>{x.crop?.name ?? "Bez uprawy"}:</b> {x.headline}
              </li>
            ))}
          </ul>
        )}
        {partFigs.length > 0 && <div className="pd-figs-2">{partFigs.map((s) => fig(s.key, true))}</div>}
      </Chapter>

      {r.period && (
        <Chapter n={next()} title={`Wybrany okres: ${shortDate(r.period.from)} – ${shortDate(r.period.to)}`}>
          <p>{r.period.say}</p>
          <table className="pd-table">
            <thead>
              <tr>
                <th>Wskaźnik</th>
                <th className="r">Wartość</th>
                <th className="r">Norma (10 lat)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Opad</td>
                <td className="r">{num(r.period.rainMm)} mm</td>
                <td className="r">{num(r.period.rainNormMm)} mm</td>
              </tr>
              <tr>
                <td>Parowanie (ET0)</td>
                <td className="r">{num(r.period.et0Mm)} mm</td>
                <td className="r">{num(r.period.et0NormMm)} mm</td>
              </tr>
              <tr>
                <td>Bilans wody (opad − parowanie)</td>
                <td className="r">{r.period.kbwMm < 0 ? "−" : "+"}{num(Math.abs(r.period.kbwMm))} mm</td>
                <td className="r">—</td>
              </tr>
              <tr>
                <td>Dni stresu uprawy</td>
                <td className="r">{r.period.seasonDays > 0 ? `${r.period.stressDays} z ${r.period.seasonDays}` : "poza sezonem"}</td>
                <td className="r">—</td>
              </tr>
            </tbody>
          </table>
          <p className="pd-note">
            {r.period.iungDrought === null
              ? "Kryterium suszy IUNG dotyczy sezonu 21.III–30.IX — ten okres jest poza nim."
              : r.period.iungDrought
                ? "W tym okresie spełnione było kryterium suszy rolniczej IUNG."
                : "W tym okresie nie było spełnione kryterium suszy rolniczej IUNG."}{" "}
            Wilgotniejszy był ten sam okres w {r.period.wetterYears} z 10 poprzednich lat.
          </p>
        </Chapter>
      )}

      {r.actions.length > 0 && (
        <Chapter n={next()} title="Plan działań" lead={fig("plan")}>
          {r.actions.map((a) => (
            <ActionBlock key={a.n} a={a} report={r} />
          ))}
        </Chapter>
      )}

      {condFigs.length > 0 && (
        <Chapter n={next()} title="Warunki na działce" lead={fig(condFigs[0].key)}>
          {condFigs.slice(1).map((s) => fig(s.key))}
        </Chapter>
      )}

      {r.causes.length > 0 && (
        <Chapter n={next()} title="Co zwiększa ryzyko suszy">
          <table className="pd-table">
            <thead>
              <tr>
                <th>Przyczyna</th>
                <th>Waga</th>
                <th>Na czym to opieramy</th>
              </tr>
            </thead>
            <tbody>
              {r.causes.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.level}</td>
                  <td className="pd-muted">{c.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Chapter>
      )}

      {r.risk && (
        <Chapter n={next()} title={r.risk.head}>
          <p>{r.risk.say}</p>
          <table className="pd-table pd-risk">
            <caption>
              W ilu z {r.scenarios} scenariuszy pogodowych uprawa będzie w stresie wodnym
            </caption>
            <thead>
              <tr>
                <th />
                {r.risk.cols.map((c) => (
                  <th key={c} className="r">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>bez działań</th>
                {r.risk.noAction.map((v, i) => (
                  <td key={i} className="r">
                    {v}/{r.scenarios}
                  </td>
                ))}
              </tr>
              <tr>
                <th>z planem</th>
                {r.risk.withPlan.map((v, i) => (
                  <td key={i} className="r">
                    {v}/{r.scenarios}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="pd-note">{r.risk.note}</p>
        </Chapter>
      )}

      {r.vulnerability && history.length > 0 && (
        <Chapter n={next()} title="Ostatnie 10 lat">
          <p>
            {r.vulnerability.text}
          </p>
          <table className="pd-table">
            <thead>
              <tr>
                <th>Sezon</th>
                <th>Uprawa</th>
                <th>Susza</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.year}>
                  <td>{h.year}</td>
                  <td>
                    {h.crop}
                    {h.cropKnown === false ? " *" : ""}
                  </td>
                  <td>{h.tag === "brak" ? "bez suszy" : h.tag}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="pd-note">
            {r.justification?.historyNote}
            {history.some((h) => h.cropKnown === false) && " * nie wiemy, co rosło w tym sezonie — przyjęto bieżącą uprawę."}
          </p>
        </Chapter>
      )}

      <Chapter n={next()} title="Źródła danych i ograniczenia">
        <table className="pd-table">
          <thead>
            <tr>
              <th>Dane</th>
              <th>Źródło</th>
              <th>Uwagi</th>
            </tr>
          </thead>
          <tbody>
            {r.sources.map((s, i) => (
              <tr key={`${s.id}-${i}`}>
                <td>{s.what}</td>
                <td>{s.source ?? "brak danych"}</td>
                <td className="pd-muted">{s.note ?? (s.fetchedAt ? `pobrano ${shortDate(s.fetchedAt)}` : "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.notChecked.length > 0 && (
          <>
            <h3>Czego nie sprawdziliśmy</h3>
            <ul className="pd-list">
              {r.notChecked.map((n) => (
                <li key={n.what}>
                  <b>{n.what.replace(/:\s*$/, "")}</b>
                  {n.why ? `: ${n.why}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
        {r.advisorDetails.length > 0 && (
          <>
            <h3>Szczegóły dla doradcy</h3>
            <ul className="pd-list">
              {r.advisorDetails.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </>
        )}
        <p className="pd-note">
          Raport przygotowany automatycznie na podstawie danych publicznych; nie zastępuje oględzin pola ani porady doradcy rolnego. Wersja
          interaktywna: {madeOn ? `${location.origin}${url}` : url}
        </p>
      </Chapter>
    </article>
  );
}
