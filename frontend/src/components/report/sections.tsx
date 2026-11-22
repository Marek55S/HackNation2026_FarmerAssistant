"use client";

import { shortDate } from "@/lib/dates";
import { useState, type ReactNode } from "react";
import type {
  ActionCategory,
  CauseLevel,
  DroughtTag,
  MapLayer,
  Report,
  ReportPart,
  RuleId,
  Zalecenie,
} from "@/lib/types";
import { Card, ICON, Icon, SCALE, StatusPill } from "../ui";
import { CAT, LAYERS, partColor } from "./map-style";

const ha = (v: number) =>
  v.toLocaleString("pl-PL", { maximumFractionDigits: 2 });

/**
 * "Uprawy na tej działce": jedna karta na uprawę. Pogoda, gleba, teren i zlewnia są wspólne dla działki,
 * więc różnią się tylko te liczby, które zależą od rośliny — zapas wody i próg stresu.
 */
export function CropParts({
  report,
  onPick,
  top = false,
}: {
  report: Report;
  /** At the top of the report instead of the dark state card: dark cards, no section header */
  top?: boolean;
  onPick: (n: number) => void;
}) {
  if (report.parts.length < 2) return null;
  const stan = `stan na ${shortDate(report.date)} · pewność ${report.confidence.level}`;
  const grid = (
    <div className={`grid gap-3 sm:grid-cols-2 ${top ? "" : "xl:grid-cols-3"}`}>
      {report.parts.map((p, i) => (
        <CropPartCard
          key={p.id}
          part={p}
          color={partColor(i)}
          actions={report.actions.filter((a) => a.czesc === p.id)}
          onPick={onPick}
          dark={top}
          footer={top ? stan : null}
        />
      ))}
    </div>
  );
  if (top) {
    return (
      <section aria-label={`Uprawy na tej działce, ${stan}`} className="min-w-0">
        {grid}
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-3" aria-label="Uprawy na tej działce">
      <SectionHead
        eyebrow={`${report.parts.length} części działki`}
        title="Uprawy na tej działce"
        sub="Woda, gleba i teren są wspólne, zalecenia polowe liczymy osobno dla każdej uprawy."
      />
      {grid}
    </section>
  );
}

/**
 * One crop of the parcel. Built as fixed rows (name, two-line summary, water bar, source, actions) so cards
 * side by side line up; `dark` is the look of the state card at the top of the report.
 */
/**
 * Category colours on the dark green card: the saturated map colours (blue, dark green) clash with it or vanish,
 * so the badges use light, muted tints of the same hues with dark digits.
 */
const ON_DARK: Record<keyof typeof CAT, string> = { ret: "#a6d4b4", agro: "#e3bb82", irr: "#8ec9c4" };

function CropPartCard({
  part,
  color,
  actions,
  onPick,
  dark = false,
  footer = null,
}: {
  part: ReportPart;
  /** Same colour as this part on the map */
  color: string;
  actions: Zalecenie[];
  onPick: (n: number) => void;
  dark?: boolean;
  /** Small line at the bottom (date and confidence of the state) */
  footer?: string | null;
}) {
  const muted = dark ? "text-feature-muted" : "text-muted";
  const below = part.soilWaterPct !== null && part.stressThresholdPct !== null && part.soilWaterPct < part.stressThresholdPct;
  return (
    <article
      className={`print-break-avoid flex h-full flex-col gap-3 rounded-[var(--r-card)] p-5 max-sm:p-4 ${
        dark ? "bg-feature text-feature-ink" : "border border-rule bg-paper"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className={`flex items-center gap-2 text-[18px] font-semibold leading-snug ${dark ? "text-feature-ink" : ""}`}>
            <span className="h-3.5 w-3.5 flex-none rounded-[4px] border-2" style={{ borderColor: color, background: `${color}55` }} aria-hidden="true" />
            <span className="truncate">{part.crop?.id === "brak" ? "Brak uprawy" : (part.crop?.name ?? "Bez wskazanej uprawy")}</span>
          </h3>
          <span className={`text-[13px] ${muted}`}>
            {ha(part.areaHa)} ha · {part.sharePct}% działki
          </span>
        </div>
        <span className="flex-none">
          <StatusPill tone={part.status.tone} label={part.status.label} small onDark={dark} />
        </span>
      </div>
      {/* Always two lines tall, so the water bars of neighbouring cards sit at the same height. */}
      <p className={`line-clamp-2 min-h-[2.6em] text-[14px] leading-[1.3] ${dark ? "text-feature-ink" : "text-ink-2"}`} title={part.headline}>
        {part.headline}
      </p>
      {part.soilWaterPct !== null && part.stressThresholdPct !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className={muted}>Woda w glebie</span>
            <span className="tabular font-semibold">
              {part.soilWaterPct}% <span className={`font-normal ${muted}`}>· próg {part.stressThresholdPct}%</span>
            </span>
          </div>
          <div className={`relative h-2 rounded-full ${dark ? "bg-white/15" : "bg-chip"}`} aria-hidden="true">
            <span
              className={`absolute inset-y-0 left-0 rounded-full ${below ? "bg-[#e9784a]" : dark ? "bg-[#8ec9c4]" : "bg-[#2a78d6]"}`}
              style={{ width: `${Math.min(100, part.soilWaterPct)}%` }}
            />
            <span className={`absolute -top-1 bottom-[-4px] w-0.5 ${dark ? "bg-white" : "bg-ink"}`} style={{ left: `${part.stressThresholdPct}%` }} />
          </div>
        </div>
      )}
      <p className={`truncate text-xs ${muted}`} title={part.manual ? "dodane przez Ciebie" : part.cropSplitSource}>
        {part.manual ? "dodane przez Ciebie" : part.cropSplitSource}
      </p>
      {actions.length > 0 && (
        <div className="flex flex-col items-start gap-1.5">
          {actions.map((a) => (
            <button
              key={a.n}
              onClick={() => onPick(a.n)}
              className={`inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-left text-[13px] font-semibold ${
                dark ? "border-white/20 text-feature-ink hover:bg-white/10" : "border-rule-strong text-ink hover:border-heading"
              }`}
            >
              <span
                className={`inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full px-1 text-[11px] font-bold ${dark ? "text-[#1d2b23]" : "text-white"}`}
                style={{ background: dark ? ON_DARK[a.kategoria] : CAT[a.kategoria].color }}
              >
                {a.n}
              </span>
              <span className="truncate">{a.co}</span>
            </button>
          ))}
        </div>
      )}
      {footer && <p className={`mt-auto pt-1 text-[11px] ${muted}`}>{footer}</p>}
    </article>
  );
}


/**
 * One header for every report section: a short label that tells where the reader is in the story
 * (stan → plan → przyczyny → co dalej → 10 lat → źródła), the title, and at most one line of context.
 */
export function SectionHead({ eyebrow, title, sub, children }: { eyebrow: string; title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">{eyebrow}</span>
        <h2 className="text-[20px] font-semibold leading-tight tracking-tight text-heading">{title}</h2>
        {sub && <p className="text-[13px] text-ink-3">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

/** Same padding and rhythm for every section card. */
export const SECTION = "print-break-avoid flex min-w-0 flex-col gap-5 p-6 max-sm:gap-4 max-sm:p-4";

export const RULE_ICON: Partial<Record<RuleId, string>> = {
  R1: ICON.gate,
  R2: ICON.pond,
  R3: ICON.trees,
  R5: ICON.sprout,
  R7: ICON.watering,
  R8: ICON.watering,
};

/**
 * "Co zrobić i gdzie": compact cards (icon, title, when) that expand for the details.
 * Clicking a card selects it on the map and opens it; clicking the open card again closes it.
 */
export function ActionList({
  actions,
  parts,
  pin,
  onPick,
}: {
  actions: Zalecenie[];
  parts: ReportPart[];
  pin: number;
  onPick: (a: Zalecenie) => void;
}) {
  // The selected card is open unless the user closed it; selecting another card (or a map pin) opens that one.
  const [closedFor, setClosedFor] = useState<number | null>(null);
  const kategorie: ActionCategory[] = ["ret", "agro", "irr"];
  // Retencja dotyczy całej działki (gleba, teren, zlewnia), reszta zaleceń należy do konkretnej uprawy.
  const wiele = parts.length > 1;
  const sekcje: { key: string; naglowek: string | null; items: Zalecenie[] }[] =
    wiele
      ? [
          {
            key: "dzialka",
            naglowek: "Cała działka",
            items: actions.filter((a) => a.czesc === null),
          },
          ...parts.map((p) => ({
            key: p.id,
            naglowek: `${p.crop?.name ?? "Bez uprawy"} · ${ha(p.areaHa)} ha`,
            items: actions.filter((a) => a.czesc === p.id),
          })),
        ]
      : [{ key: "all", naglowek: null, items: actions }];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2.5">
        <h3 className="text-[17px] font-semibold text-heading">Lista działań</h3>
        <span className="text-[13px] text-muted">numery jak na mapie</span>
      </div>
      {sekcje.map((s) =>
        s.items.length === 0 ? null : (
          <section key={s.key} className="flex flex-col gap-4">
            {s.naglowek && (
              <h3 className="border-b border-rule-strong pb-1.5 text-[15px] font-semibold text-heading">
                {s.naglowek}
              </h3>
            )}
            {kategorie.map((g) => {
              const items = s.items.filter((a) => a.kategoria === g);
              if (items.length === 0) return null;
              return (
                <div key={g} className="flex flex-col gap-2">
                  <h4
                    className="text-xs font-bold uppercase tracking-[0.06em]"
                    style={{ color: CAT[g].ink }}
                  >
                    {CAT[g].name.replace(/^\d · /, "")}
                  </h4>
                  {items.map((a) => {
                    const selected = pin === a.n;
                    const open = selected && closedFor !== a.n;
                    return (
                      <div
                        key={a.n}
                        className={`print-break-avoid overflow-hidden rounded-[18px] border bg-paper transition-[border-color,box-shadow] duration-150 ${
                          selected
                            ? "border-heading shadow-[0_0_0_1px_var(--heading)]"
                            : "border-rule hover:border-rule-strong"
                        }`}
                      >
                        <button
                          onClick={() => {
                            if (selected) setClosedFor(open ? a.n : null);
                            else {
                              setClosedFor(null);
                              onPick(a);
                            }
                          }}
                          aria-expanded={open}
                          className="flex w-full items-center gap-3.5 px-3.5 py-3 text-left"
                        >
                          <span className="relative flex-none">
                            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-chip text-heading">
                              <Icon
                                d={RULE_ICON[a.regula] ?? ICON.check}
                                size={24}
                                stroke={1.6}
                              />
                            </span>
                            <span
                              className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-paper px-1 text-[11px] font-bold text-white"
                              style={{ background: CAT[a.kategoria].color }}
                            >
                              {a.n}
                            </span>
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-[15px] font-semibold leading-snug text-ink">
                              {a.co}
                            </span>
                            <span
                              className={`text-[13px] text-muted ${open ? "" : "truncate"}`}
                            >
                              {a.kiedy}
                            </span>
                          </span>
                          <Icon
                            d={ICON.chevronDown}
                            size={18}
                            className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                          />
                        </button>
                        {open && (
                          <div className="reveal flex flex-col gap-3 border-t border-rule-soft px-3.5 pb-4 pt-3 text-[13px]">
                            <p className="flex items-start gap-2 rounded-xl bg-primary-tint px-3 py-2 text-ink">
                              <Icon d={ICON.trend} size={16} stroke={2} className="mt-0.5 flex-none text-heading" />
                              <span>
                                <span className="font-semibold text-heading">Co zyskasz: </span>
                                {a.co_zyskasz}
                              </span>
                            </p>
                            {a.kroki?.length > 0 && (
                              <div className="flex flex-col gap-1.5">
                                <h4 className="text-xs font-bold uppercase tracking-[0.06em] text-heading">Co zrobić</h4>
                                <ol className="flex flex-col gap-1.5">
                                  {a.kroki.map((k, i) => (
                                    <li key={i} className="flex items-start gap-2.5 text-ink">
                                      <span className="mt-px inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-chip text-[11px] font-bold text-heading">
                                        {i + 1}
                                      </span>
                                      <span className="leading-snug">{k}</span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                              <dt className="text-muted">Gdzie</dt>
                              <dd className="text-ink">{a.gdzie}</dd>
                              {a.ile && (
                                <>
                                  <dt className="text-muted">Ile</dt>
                                  <dd className="text-ink">{a.ile}</dd>
                                </>
                              )}
                              <dt className="text-muted">Bo</dt>
                              <dd className="text-ink">{a.bo.join("; ")}</dd>
                            </dl>
                            {/* The long explanation is for whoever wants it — the card stays short. */}
                            <details className="group/why border-t border-rule-soft pt-2">
                              <summary className="flex min-h-8 list-none items-center gap-1.5 font-semibold text-heading [&::-webkit-details-marker]:hidden">
                                <Icon d={ICON.chevronRight} size={14} className="transition-transform duration-200 group-open/why:rotate-90" />
                                Dlaczego właśnie tu?
                              </summary>
                              <div className="flex flex-col gap-2 pt-1">
                                <p className="leading-relaxed text-ink-2">{a.dlaczego}</p>
                                {a.tagi.length > 0 && <p className="text-muted">{a.tagi.join(" · ")}</p>}
                                <p className="text-xs text-muted">
                                  Reguła {a.regula} · na podstawie: {a.fakty.join(", ")}
                                  <span className="no-print"> · na mapie: {LAYERS[a.warstwa].toLowerCase()}</span>
                                </p>
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>
        ),
      )}
    </div>
  );
}

/** Cause weight as a quiet 3-step meter (like signal bars) instead of coloured pills. */
const WEIGHT: Record<CauseLevel, { n: number; label: string }> = {
  główna: { n: 3, label: "główny wpływ" },
  duża: { n: 2, label: "duży wpływ" },
  mała: { n: 1, label: "mały wpływ" },
};

function WeightMeter({ level }: { level: CauseLevel }) {
  const w = WEIGHT[level];
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-muted"
      title={w.label}
    >
      <span
        className="inline-flex h-3.5 items-end gap-[3px]"
        aria-hidden="true"
      >
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-[5px] rounded-[2px] ${i <= w.n ? "bg-heading" : "bg-rule-strong"}`}
            style={{ height: 4 + i * 3.5 }}
          />
        ))}
      </span>
      <span className="whitespace-nowrap">{w.label}</span>
    </span>
  );
}

const ORDER: Record<CauseLevel, number> = { główna: 0, duża: 1, mała: 2 };

export function Causes({
  report,
  onShow,
}: {
  report: Report;
  onShow: (l: MapLayer) => void;
}) {
  const byWeight = [...report.causes].sort(
    (a, b) => ORDER[a.level] - ORDER[b.level],
  );
  const groups = [
    {
      title: "Pogoda",
      note: "na to nie masz wpływu",
      items: byWeight.filter((c) => !c.layer),
    },
    {
      title: "Cechy działki",
      note: "na to można wpłynąć — zobacz zalecenia",
      items: byWeight.filter((c) => c.layer),
    },
  ].filter((g) => g.items.length > 0);
  return (
    <Card id="przyczyny" className={SECTION}>
      <SectionHead eyebrow="Dlaczego" title="Co zwiększa ryzyko na tej działce" />
      <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
      {groups.map((g) => (
        <div key={g.title} className="flex min-w-0 flex-col">
          <h3 className="flex flex-wrap items-baseline gap-x-2 pb-1 text-xs font-bold uppercase tracking-[0.06em] text-heading">
            {g.title}
            <span className="text-[11px] font-medium normal-case tracking-normal text-muted">
              {g.note}
            </span>
          </h3>
          <ul className="flex flex-col">
            {g.items.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-3.5 border-t border-rule-soft py-3 first:border-t-0"
              >
                <span className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-chip text-heading">
                  <Icon d={ICON[c.icon]} size={24} stroke={1.6} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="text-[15px] font-semibold text-ink">
                      {c.name}
                    </span>
                    <WeightMeter level={c.level} />
                  </span>
                  <span className="text-[13px] leading-snug text-ink-3">
                    {c.evidence}
                  </span>
                  {c.layer && (
                    <button
                      onClick={() => onShow(c.layer!)}
                      className="no-print mt-0.5 inline-flex items-center gap-1.5 self-start rounded-full py-1 text-[13px] font-semibold text-heading hover:underline"
                    >
                      <Icon d={ICON.map} size={15} stroke={1.75} />
                      Pokaż na mapie: {LAYERS[c.layer].toLowerCase()}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      </div>
    </Card>
  );
}

const riskClass = (n: number, total: number) => {
  const share = n / total;
  return SCALE[share >= 0.7 ? 4 : share >= 0.4 ? 3 : share >= 0.2 ? 2 : 0];
};

const TAG: Record<DroughtTag, string> = {
  skrajna: SCALE[4],
  silna: SCALE[3],
  "umiark.": SCALE[2],
  lekka: SCALE[1],
  brak: SCALE[0],
};

export function Risk({ report }: { report: Report }) {
  const { risk, scenarios: N } = report;
  if (!risk) return null;
  const row = (label: string, values: number[]) => (
    <tr>
      <th
        scope="row"
        className="whitespace-nowrap pr-1.5 text-left text-xs font-semibold text-ink-2"
      >
        {label}
      </th>
      {values.map((n, i) => (
        <td
          key={i}
          className={`tabular rounded-md px-0.5 py-2 text-center text-[13px] font-bold max-sm:text-[11px] ${riskClass(n, N)}`}
        >
          {n}/{N}
        </td>
      ))}
    </tr>
  );
  return (
    <Card id="co-dalej" className={`${SECTION} flex-[1_1_380px]`}>
      <SectionHead eyebrow="Co dalej" title={risk.head} />
      {/* First sentence = the risk without action (bold); the rest explains what the plan changes. */}
      <p className="text-[15px] leading-snug">
        {(() => {
          const [lead, ...rest] = risk.say.split(/(?<=\.)\s+(?=[A-ZŻŹĆŁŚÓ])/);
          return (
            <>
              <span className="font-semibold">{lead}</span>
              {rest.length > 0 && (
                <span className="text-ink-2"> {rest.join(" ")}</span>
              )}
            </>
          );
        })()}
      </p>
      <table className="w-full table-fixed border-separate border-spacing-1">
        <caption className="sr-only">
          W ilu z {N} scenariuszy uprawa będzie w stresie wodnym: bez działań i
          z planem
        </caption>
        <colgroup>
          <col className="w-[84px] max-sm:w-[70px]" />
        </colgroup>
        <thead>
          <tr>
            <td />
            {risk.cols.map((c) => (
              <th
                key={c}
                scope="col"
                className="text-center text-[11px] font-normal text-muted max-sm:text-[10px]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row("bez działań", risk.noAction)}
          {row("z planem", risk.withPlan)}
        </tbody>
      </table>
      <span className="text-xs text-muted">{risk.note}</span>
    </Card>
  );
}

/**
 * 10-year vulnerability (task 3.3 pt 4), shown at the end of the report, above the sources:
 * how often the parcel ran short of water, season by season, each judged for the crop grown that year.
 */
export function Vulnerability({ report }: { report: Report }) {
  const v = report.vulnerability;
  const history = report.justification?.history ?? [];
  if (!v || history.length === 0) return null;
  const assumed = history.filter((h) => h.cropKnown === false).length;
  return (
    <Card id="historia" className={SECTION}>
      <SectionHead
        eyebrow="Ostatnie 10 lat"
        title="Jak często brakowało wody"
        sub={`${report.yearsLabel ? `${report.yearsLabel} · ` : ""}każdy sezon oceniony dla uprawy, która wtedy rosła`}
      />
      <ul className="grid grid-cols-5 gap-1.5 md:grid-cols-10" aria-label={`Susza w ${v.drought} z ${v.seasons} sezonów`}>
        {history.map((h) => (
          <li
            key={h.year}
            title={
              h.note ||
              `${h.crop} — ${h.tag === "brak" ? "bez suszy" : `susza: ${h.tag}`}`
            }
            className={`flex flex-col items-center gap-px rounded-lg px-1 py-1.5 ${TAG[h.tag]}`}
          >
            <b className="tabular text-[13px]">{h.year}</b>
            <span className="text-center text-[11px] leading-tight">
              {h.crop}
              {h.cropKnown === false && (
                <span aria-label="uprawa przyjęta">*</span>
              )}
            </span>
            <span className="text-center text-[11px] font-bold leading-tight">
              {h.tag === "brak" ? "bez suszy" : h.tag}
            </span>
          </li>
        ))}
      </ul>
      <span className="text-xs text-muted">
        {report.justification?.historyNote}
        {assumed > 0 &&
          ` * w ${assumed} ${assumed === 1 ? "sezonie" : "sezonach"} nie wiemy, co rosło — przyjęto bieżącą uprawę.`}
      </span>
    </Card>
  );
}

export function Sources({ report }: { report: Report }) {
  const fetched = report.sources.find((x) => x.fetchedAt)?.fetchedAt;
  return (
    <Card id="zrodla" className={SECTION}>
      <SectionHead
        eyebrow="Źródła"
        title="Skąd wiemy"
        sub={`${report.sources.length} źródeł danych publicznych${fetched ? ` · pobrane ${shortDate(fetched)}` : ""}`}
      />

      {/* Plain two-column list: what · where from. Caveats only where something is off — no badges. */}
      <dl className="grid gap-x-12 md:grid-cols-2">
        {report.sources.map((x, i) => (
          <div
            key={`${x.id}-${i}`}
            className="flex items-baseline justify-between gap-4 border-t border-rule-soft py-2.5 text-[13px]"
          >
            <dt className="font-medium text-ink">{x.what}</dt>
            <dd className="flex flex-col items-end text-right">
              <span className={x.source ? "text-ink-2" : "text-muted"}>
                {x.source ?? "brak danych"}
              </span>
              {x.note && (
                <span
                  className={`text-xs ${x.state === "missing" ? "text-danger-ink" : "text-muted"}`}
                >
                  {x.note}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {report.notChecked.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="pb-1 text-xs font-bold uppercase tracking-[0.06em] text-heading">
            Czego nie sprawdziliśmy
          </h3>
          <ul className="flex flex-col">
            {report.notChecked.map((n) => (
              <li
                key={n.what}
                className="flex items-baseline justify-between gap-4 border-t border-rule-soft py-2.5 text-[13px]"
              >
                <span className="font-medium text-ink">{n.what}</span>
                <span className="text-right text-muted">{n.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.advisorDetails.length > 0 && (
        <details className="group border-t border-rule-soft pt-3">
          <summary className="flex min-h-8 list-none items-center gap-1.5 text-sm font-semibold text-heading [&::-webkit-details-marker]:hidden">
            <Icon
              d={ICON.chevronRight}
              size={15}
              className="transition-transform duration-200 group-open:rotate-90"
            />
            Szczegóły dla doradcy: liczby, metody, ograniczenia
          </summary>
          <ul className="mt-2.5 list-disc pl-[18px] text-[13px] leading-relaxed text-ink-2">
            {report.advisorDetails.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

/** Summary of the chosen period (from–to); shown only when the farmer picked a range. */
export function PeriodSummaryCard({ report }: { report: Report }) {
  const p = report.period;
  if (!p) return null;
  const fmt = (n: number) => n.toLocaleString("pl-PL");
  const diff = (a: number, b: number) =>
    `${a >= b ? "+" : "−"}${fmt(Math.abs(a - b))} mm wobec normy`;
  const stats: { label: string; value: string; note: string }[] = [
    {
      label: "Opad",
      value: `${fmt(p.rainMm)} mm`,
      note: diff(p.rainMm, p.rainNormMm),
    },
    {
      label: "Parowanie (ET0)",
      value: `${fmt(p.et0Mm)} mm`,
      note: diff(p.et0Mm, p.et0NormMm),
    },
    {
      label: "Bilans wody",
      value: `${p.kbwMm < 0 ? "−" : "+"}${fmt(Math.abs(p.kbwMm))} mm`,
      note: "opad minus parowanie",
    },
    {
      label: "Dni stresu uprawy",
      value: p.seasonDays > 0 ? `${p.stressDays} z ${p.seasonDays}` : "—",
      note:
        p.seasonDays > 0
          ? `najniższy zapas wody ${p.minSoilPct}%`
          : "okres poza sezonem",
    },
  ];
  return (
    <Card className={SECTION}>
      <SectionHead eyebrow={`Wybrany okres · ${p.days} dni`} title={`${shortDate(p.from)} – ${shortDate(p.to)}`} sub={p.say} />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-0.5 border-l-2 border-rule pl-3"
          >
            <dt className="text-xs font-semibold text-muted">{s.label}</dt>
            <dd className="tabular text-xl font-extrabold">{s.value}</dd>
            <dd className="text-xs text-ink-3">{s.note}</dd>
          </div>
        ))}
      </dl>
      <span className="text-xs text-muted">
        {p.iungDrought === null
          ? "Kryterium suszy IUNG dotyczy sezonu 21.III–30.IX — ten okres jest poza nim."
          : p.iungDrought
            ? "W tym okresie spełnione było kryterium suszy rolniczej IUNG."
            : "W tym okresie nie było spełnione kryterium suszy rolniczej IUNG."}{" "}
        Norma: ten sam okres w 10 poprzednich latach (ERA5-Land). Zalecenia
        niżej dotyczą dnia {shortDate(p.to)}.
      </span>
    </Card>
  );
}
